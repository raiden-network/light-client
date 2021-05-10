import type { UserSettingsState } from './types';

export const defaultState = (): UserSettingsState => ({
  useRaidenAccount: true,
  ethereumProviderOptions: {},
});

const state: UserSettingsState = defaultState();

export default state;
