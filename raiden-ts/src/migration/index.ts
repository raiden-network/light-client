/* eslint-disable @typescript-eslint/no-explicit-any */
import logging from 'loglevel';

import m0 from './0';
import m1 from './1';
import m2 from './2';
import m3 from './3';

// import above and populate this array with new migrator functions, index is version
const migrations = [m0, m1, m2, m3];
export const CURRENT_STATE_VERSION = migrations.length - 1;

/**
 * Migrate a RaidenState from any previous version to latest one
 *
 * @param state - Previous raiden state
 * @param toVersion - Migrate up to this version
 * @param opts - Options
 * @param opts.log - Logger instance
 * @returns A current RaidenState (hopefully), to be validated
 */
export default function migrateState(
  state: any,
  toVersion: number = CURRENT_STATE_VERSION,
  { log }: { log: logging.Logger } = { log: logging },
) {
  for (let version = (state?.version ?? -1) + 1; version <= toVersion; version++) {
    try {
      state = Object.assign(migrations[version](state), { version });
    } catch (err) {
      log.error(`Error migrating state from version ${version - 1} to ${version}`, state, err);
      throw err;
    }
  }
  // this must be validated as RaidenState, but is done in decodeRaidenState to avoid cyclic import
  return state;
}
