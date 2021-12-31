import { getters } from '@/store/version-information/getters';
import { defaultState } from '@/store/version-information/state';

describe('version information store getters', () => {
  describe('correct version is loaded', () => {
    let localStorageGetItemSpy: jest.SpyInstance;

    beforeAll(() => {
      localStorageGetItemSpy = jest.spyOn(Object.getPrototypeOf(window.localStorage), 'getItem');
      localStorageGetItemSpy.mockImplementation((key: string): string | null =>
        key === 'disclaimer' ? '{"some": "data"}' : null,
      );
    });

    afterAll(() => {
      localStorageGetItemSpy.mockRestore();
    });

    test('is true when user loaded the application for the first time', () => {
      const state = defaultState();
      localStorageGetItemSpy.mockReturnValueOnce(null);

      expect(getters.correctVersionIsLoaded(state)).toBeTruthy();
    });

    test('is true when an update is in progress', () => {
      const state = defaultState();
      state.updateInProgress = true;

      expect(getters.correctVersionIsLoaded(state)).toBeTruthy();
    });

    test('is true when no installed version is known and active version <= 2.0.1', () => {
      const state = defaultState();
      state.installedVersion = undefined;
      state.activeVersion = '2.0.1';

      expect(getters.correctVersionIsLoaded(state)).toBeTruthy();

      state.activeVersion = '1.1.0';

      expect(getters.correctVersionIsLoaded(state)).toBeTruthy();
    });

    test('is false when no installed version is known and active version > 2.0.1', () => {
      const state = defaultState();
      state.installedVersion = undefined;
      state.activeVersion = '2.0.2';

      expect(getters.correctVersionIsLoaded(state)).toBeFalsy();

      state.activeVersion = '3.0.0';

      expect(getters.correctVersionIsLoaded(state)).toBeFalsy();
    });

    test('is true when active version is equal to the installed version', () => {
      const state = defaultState();
      state.installedVersion = '1.0.0';
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
