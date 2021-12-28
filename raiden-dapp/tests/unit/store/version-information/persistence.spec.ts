import { createLocalVue } from '@vue/test-utils';
import Vuex, { Store } from 'vuex';

import type { RootStateWithVersionInformation } from '@/store/version-information';
import {
  createVersionInformationPeristencePlugin,
  versionInformation,
} from '@/store/version-information';

import { MockedLocalStorage } from '../../utils/mocks/local-storage';

const localVue = createLocalVue();
localVue.use(Vuex);

function createStore(storage: Storage): Store<RootStateWithVersionInformation> {
  const plugin = createVersionInformationPeristencePlugin(storage);

  return new Store({
    modules: { versionInformation },
    plugins: [plugin],
  });
}

describe('version information store persistence', () => {
  test('write installed version to storage on updates', () => {
    const storage = new MockedLocalStorage();
    const store = createStore(storage);

    store.commit('versionInformation/setInstalledVersion', '1.0.0');

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      'raiden_dapp_versionInformation',
      JSON.stringify({ versionInformation: { installedVersion: '1.0.0' } }),
    );
  });

  test('read installed version from storage on initialization', () => {
    const raiden_dapp_versionInformation = {
      versionInformation: { installedVersion: '1.0.0' },
    };
    const storage = new MockedLocalStorage({ raiden_dapp_versionInformation });
    const store = createStore(storage);

    expect(store.state.versionInformation.installedVersion).toBe('1.0.0');
  });
});
