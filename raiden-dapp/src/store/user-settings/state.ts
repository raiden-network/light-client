import type { UserSettingsState } from './types';

export const defaultState = (): UserSettingsState => ({
  useRaidenAccount: true,
  ethereumConnectionOptions: {},
});

const state: UserSettingsState = defaultState();

export default state;
