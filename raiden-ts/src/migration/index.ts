/* eslint-disable @typescript-eslint/no-explicit-any */
import logging from 'loglevel';
import { assert } from '../utils/types';

import m0 from './0';
import m1 from './1';
import m2 from './2';

// import above and populate this dict with new migrator functions
// must be ordered, continuous, and last one MUST be state.CURRENT_STATE_VERSION
const migrations = { 0: m0, 1: m1, 2: m2 };

/**
 * Migrate a RaidenState from any previous version to latest one
 *
 * @param state - Previous raiden state
 * @param toVersion - Migrate up to this version
 * @returns A current RaidenState (hopefully), to be validated
 */
export default function migrateState(
  state: any,
  toVersion: number,
  { log }: { log: logging.Logger } = { log: logging },
) {
  for (let v = 0; v <= toVersion; v++) assert(v in migrations, `missing migration for ${v}`);
  for (const [key, migrate] of Object.entries(migrations)) {
    const version = +key;
    if ((state?.version ?? -1) !== version - 1) continue;
    if (version > toVersion) continue;
    try {
      state = Object.assign(migrate(state), { version });
    } catch (err) {
      log.error(`Error migrating state from version ${version - 1} to ${version}`, state, err);
      throw err;
    }
  }
  // this must be validated as RaidenState, but is done in decodeRaidenState to avoid cyclic import
  return state;
}
