import { getters } from '@/store/version-information/getters';
import { defaultState } from '@/store/version-information/state';

describe('version information store getters', () => {
  test('update is available when available version is higher than active one', () => {
    const state = defaultState();
    state.activeVersion = '1.0.0';
    state.availableVersion = '2.0.0';

    expect(getters.updateIsAvailable(state)).toBeTruthy();
  });

  test('no update is available when available version is equal to the active one', () => {
    const state = defaultState();
    state.activeVersion = '2.0.0';
    state.availableVersion = '2.0.0';

    expect(getters.updateIsAvailable(state)).toBeFalsy();
  });

  test('no update is available when available version is lower than the active one', () => {
    const state = defaultState();
    state.activeVersion = '2.0.0';
    state.availableVersion = '1.0.0';

    expect(getters.updateIsAvailable(state)).toBeFalsy();
  });

  test('no update is available when the available version is unknown', () => {
    const state = defaultState();
    state.activeVersion = '1.0.0';
    state.availableVersion = undefined;

    expect(getters.updateIsAvailable(state)).toBeFalsy();
  });
});
