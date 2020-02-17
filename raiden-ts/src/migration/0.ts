/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Migrate previous state to version 0
 *
 * @param state - RaidenState version -1
 * @returns State version 0
 */
export default function migrate0(state: any) {
  return {
    ...state,
    version: 0, // not actually needed, migrateState will enforce version tag
  };
}
