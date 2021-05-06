import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import Settings from '@/views/account/Settings.vue';

jest.mock('vue-router');

Vue.use(Vuetify);
Vue.use(Vuex);

const enableRaidenAccount = jest.fn();
const disableRaidenAccount = jest.fn();

function createWrapper(options?: { useRaidenAccount?: boolean }): Wrapper<Settings> {
  const vuetify = new Vuetify();
  const state = {
    useRaidenAccount: options?.useRaidenAccount ?? true,
  };

  const mutations = {
    enableRaidenAccount,
    disableRaidenAccount,
  };

  const userSettingsModule = {
    namespaced: true,
    state,
    mutations,
  };

  const store = new Vuex.Store({
    modules: { userSettings: userSettingsModule },
  });

  return mount(Settings, {
    vuetify,
    store,
    mocks: {
      $t: (msg: string) => msg,
    },
  });
}

describe('Settings.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes setting for using raiden account', () => {
    const wrapper = createWrapper();
    expect(wrapper.text()).toContain('settings.raiden-account.title');
  });

  test('can enable raiden account usage setting', async () => {
    const wrapper = createWrapper({ useRaidenAccount: false });

    const toggleInput = wrapper.get('input');
    toggleInput.trigger('click');
    await wrapper.vm.$nextTick();

    expect(enableRaidenAccount).toHaveBeenCalledTimes(1);
    expect((toggleInput.element as HTMLInputElement).checked).toBe(true);
  });

  test('can disable raiden account usage setting', async () => {
    const wrapper = createWrapper({ useRaidenAccount: true });

    const toggleInput = wrapper.get('input');
    toggleInput.trigger('click');
    await wrapper.vm.$nextTick();

    expect(disableRaidenAccount).toHaveBeenCalledTimes(1);
    expect((toggleInput.element as HTMLInputElement).checked).toBe(false);
  });
});
