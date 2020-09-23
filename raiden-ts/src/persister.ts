/**
 * This file introduces a 'persister' middleware for redux
 *
 * It's coupled with RaidenDatabase, and runs a root _reducer-like_ function for each action/state
 * change going through redux state machine.
 * The function receives the RaidenDatabase instance, a tuple containing the current and previous
 * state, and the action which triggered this change. Like reducers, the function **must not**
 * change state, but in this case, return value is also ignored. Instead, it should do whatever
 * logic it needs to persist the new state on the database. Redux-state changes should still be
 * performed on reducers, as usual.
 * This is useful as a reducer-like synchronous function for members of the state which aren't
 * kept in the state, but on the database instead, or to sync/persist state changes to the
 * database storage.
 */

import { Dispatch, Middleware } from 'redux';
import isEmpty from 'lodash/isEmpty';

import type { RaidenState } from './state';
import type { RaidenAction } from './actions';
import type { RaidenDatabase } from './db/types';

/**
 * Create a raiden persister middleware for redux.
 * The persister will delta states before and after an action, and persist values in database.
 *
 * @param db - Raiden Database object
 * @returns Middleware function to be applied to redux
 */
export function createPersisterMiddleware(
  db: RaidenDatabase,
): Middleware<undefined, RaidenState, Dispatch<RaidenAction>> {
  const log = db.constructor.__defaults.log;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dirtyDocs: { [_id: string]: any } = {};

  // do not run concurrently
  const saveDatabase = async () => {
    while (!isEmpty(dirtyDocs)) {
      const data = dirtyDocs; // copy reference
      dirtyDocs = {};
      const keys = Object.keys(data);
      // fetch previous revs for each doc from storage
      const prevRevs = await db.allDocs({ keys });
      const getRev = (_id: string) => {
        const prev = prevRevs.rows.find((r) => r.id === _id);
        if (prev?.value?.deleted) return { _rev: prev.value.rev, deleted: false };
        else if (prev && !('error' in prev)) return { _rev: prev.value.rev };
      };
      const res = await db.bulkDocs(
        Object.entries(data).map(([_id, doc]) => ({ ...doc, _id, ...getRev(_id) })),
      );
      // set data back in dirtyDocs to retry the errored docs
      for (const r of res) {
        // if doc already present in dirty, don't overwrite to retry with updated data
        if ('error' in r && r.error && r.id && !(r.id in dirtyDocs)) {
          dirtyDocs[r.id] = data[r.id];
        }
      }
    }
  };

  return (store) => (next) => (action) => {
    const prevState = store.getState();
    const result = next(action);
    const state = store.getState();
    // TODO: clear completed transfers

    if (state === prevState) return result;

    for (const k in state) {
      const key = k as keyof RaidenState;
      // key has same value, pass over
      if (state[key] === prevState[key]) continue;
      else if (key === 'channels' || key === 'oldChannels') {
        // iterate over channels separately
        for (const id in state[key]) {
          if (state[key][id] === prevState[key][id]) continue;
          const _id = `channels.${state[key][id]._id}`;
          db.storageKeys.add(_id);
          dirtyDocs[_id] = state[key][id];
        }
      } else if (key === 'transfers') {
        // iterate over channels separately
        for (const _id in state.transfers) {
          if (state.transfers[_id] === prevState.transfers[_id]) continue;
          db.storageKeys.add(_id);
          dirtyDocs[_id] = state.transfers[_id];
        }
        // notice we don't delete cleared/removed transfers, just set cleared>0 so it's filtered out
        for (const _id in prevState.transfers) {
          if (_id in state.transfers) continue;
          dirtyDocs[_id] = { ...prevState.transfers[_id], cleared: Date.now() };
        }
      } else {
        const _id = `state.${key}`;
        db.storageKeys.add(_id);
        dirtyDocs[_id] = { value: state[key] };
      }
    }
    if (!db.busy$.value) {
      db.busy$.next(true);
      saveDatabase()
        .catch((err) => log?.warn?.('Persister saveDatabase error', err))
        .finally(() => db.busy$.next(false));
    }
    return result;
  };
}
