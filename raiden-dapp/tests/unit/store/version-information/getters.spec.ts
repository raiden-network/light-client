import { getters } from '@/store/version-information/getters';
import { defaultState } from '@/store/version-information/state';

describe('version information store getters', () => {
  describe('correct version is loaded', () => {
    test('is true when active version is equal to the installed version', () => {
      const state = defaultState();
      state.installedVersion = '1.0.0';
      state.activeVersion = '1.0.0';

      expect(getters.correctVersionIsLoaded(state)).toBeTruthy();
    });

    test('is true when no installed version is known', () => {
      const state = defaultState();
      state.installedVersion = undefined;
      state.activeVersion = '1.0.0';

      expect(getters.correctVersionIsLoaded(state)).toBeTruthy();
    });

    test('is false when active version is not equal to the installed version', () => {
      const state = defaultState();
      state.installedVersion = '1.0.0';
      state.activeVersion = '2.0.0';

      expect(getters.correctVersionIsLoaded(state)).toBeFalsy();
    });
  });

  describe('update is available', () => {
    test('is true when the available version is higher than the installed version', () => {
      const state = defaultState();
      state.installedVersion = '1.0.0';
      state.availableVersion = '2.0.0';

      expect(getters.updateIsAvailable(state)).toBeTruthy();
    });

    test('is false when the available version is equal to the installed version', () => {
      const state = defaultState();
      state.installedVersion = '2.0.0';
      state.availableVersion = '2.0.0';

      expect(getters.updateIsAvailable(state)).toBeFalsy();
    });

    test('is false when the available version is lower than the active version', () => {
      const state = defaultState();
      state.installedVersion = '2.0.0';
      state.availableVersion = '1.0.0';

      expect(getters.updateIsAvailable(state)).toBeFalsy();
    });

    test('is false when the available version is unknown', () => {
      const state = defaultState();
      state.installedVersion = '1.0.0';
      state.availableVersion = undefined;

      expect(getters.updateIsAvailable(state)).toBeFalsy();
    });
  });
});
