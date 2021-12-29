import { mutations } from '@/store/version-information/mutations';
import { defaultState } from '@/store/version-information/state';

describe('version information store mutations', () => {
  describe('setInstalledVersion()', () => {
    test('can set when in semantic version format', () => {
      const state = defaultState();
      state.installedVersion = undefined;

      mutations.setInstalledVersion(state, '1.0.0');

      expect(state.installedVersion).toBe('1.0.0');
    });

    test('can not set when not in semantic version format', () => {
      const state = defaultState();
      state.installedVersion = '1.0.0';

      mutations.setInstalledVersion(state, 'version two');

      expect(state.installedVersion).toBe('1.0.0');
    });
  });

  describe('setAvailableVersion()', () => {
    test('can set when in semantic version format', () => {
      const state = defaultState();
      state.availableVersion = '1.0.0';

      mutations.setAvailableVersion(state, '2.0.0');

      expect(state.availableVersion).toBe('2.0.0');
    });

    test('can not set when not in semantic version format', () => {
      const state = defaultState();
      state.availableVersion = '1.0.0';

      mutations.setAvailableVersion(state, 'version two');

      expect(state.availableVersion).toBe('1.0.0');
    });
  });

  describe('setUpdateIsMandatory()', () => {
    test('can be only set to true', () => {
      const state = defaultState();
      state.updateIsMandatory = false;

      mutations.setUpdateIsMandatory(state);

      expect(state.updateIsMandatory).toBeTruthy();
    });
  });

  describe('prepareUpdate()', () => {
    test('sets installed version to undefined', () => {
      const state = defaultState();
      state.installedVersion = '1.0.0';

      mutations.prepareUpdate(state);

      expect(state.installedVersion).toBeUndefined();
    });
  });
});
