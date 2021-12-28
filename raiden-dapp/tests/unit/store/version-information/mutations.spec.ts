import { mutations } from '@/store/version-information/mutations';
import { defaultState } from '@/store/version-information/state';

describe('version information store mutations', () => {
  test('can set installed version when in semantic version format', () => {
    const state = defaultState();
    state.installedVersion = undefined;

    mutations.setInstalledVersion(state, '1.0.0');

    expect(state.installedVersion).toBe('1.0.0');
  });

  test('can not set installed version when not in semantic version format', () => {
    const state = defaultState();
    state.installedVersion = '1.0.0';

    mutations.setInstalledVersion(state, 'version two');

    expect(state.installedVersion).toBe('1.0.0');
  });

  test('can set available version when in semantic version format', () => {
    const state = defaultState();
    state.availableVersion = '1.0.0';

    mutations.setAvailableVersion(state, '2.0.0');

    expect(state.availableVersion).toBe('2.0.0');
  });

  test('can not set available version when not in semantic version format', () => {
    const state = defaultState();
    state.availableVersion = '1.0.0';

    mutations.setAvailableVersion(state, 'version two');

    expect(state.availableVersion).toBe('1.0.0');
  });

  test('can set update is mandatory', () => {
    const state = defaultState();
    state.updateIsMandatory = false;

    mutations.setUpdateIsMandatory(state);

    expect(state.updateIsMandatory).toBeTruthy();
  });
});
