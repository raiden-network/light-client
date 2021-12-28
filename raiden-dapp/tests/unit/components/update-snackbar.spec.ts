import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import BlurredOverlay from '@/components/overlays/BlurredOverlay.vue';
import UpdateSnackbar from '@/components/UpdateSnackbar.vue';

Vue.use(Vuetify);
Vue.use(Vuex);

const $raiden = {
  disconnect: jest.fn(async () => undefined),
};

const $serviceWorkerAssistant = {
  update: jest.fn(),
};

function createWrapper(options?: {
  isConnected?: boolean;
  updateIsAvailable?: boolean;
  updateIsMandatory?: boolean;
}): Wrapper<UpdateSnackbar> {
  const vuetify = new Vuetify();
  const state = {
    isConnected: options?.isConnected ?? false,
  };

  const versionInformationModule = {
    namespaced: true,
    state: {
      updateIsMandatory: options?.updateIsMandatory ?? false,
    },
    getters: {
      updateIsAvailable: () => options?.updateIsAvailable ?? false,
    },
  };

  const store = new Vuex.Store({
    state,
    modules: { versionInformation: versionInformationModule },
  });

  return mount(UpdateSnackbar, {
    vuetify,
    store,
    mocks: {
      $raiden,
      $serviceWorkerAssistant,
      $t: (msg: string) => msg,
    },
  });
}

function clickUpdateButton(wrapper: Wrapper<UpdateSnackbar>): void {
  const button = wrapper.get('button');
  button.trigger('click');
}

describe('UpdateSnackbar.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not render snackbar if there is no update available nor is one mandatory', async () => {
    const wrapper = createWrapper({ updateIsAvailable: false, updateIsMandatory: false });
    const snackbar = wrapper.find('.update-snackbar');

    expect(snackbar.exists()).toBe(false);
  });

  test('render snackbar if update is available', () => {
    const wrapper = createWrapper({ updateIsAvailable: true });
    const snackbar = wrapper.find('.update-snackbar');

    expect(snackbar.exists()).toBe(true);
  });

  test('render snackbar if update is mandatory', () => {
    const wrapper = createWrapper({ updateIsMandatory: true });
    const snackbar = wrapper.find('.update-snackbar');

    expect(snackbar.exists()).toBe(true);
  });

  test('render blocking overlay if update is mandatory', () => {
    const wrapper = createWrapper({ updateIsMandatory: true });
    const overlay = wrapper.findComponent(BlurredOverlay);

    expect(overlay.exists()).toBe(true);
  });

  test('render message that update is available', () => {
    const wrapper = createWrapper({ updateIsAvailable: true });
    const message = wrapper.get('.update-snackbar__message');

    expect(message.text()).toBe('update.optional');
  });

  test('render message that update is mandatory', () => {
    const wrapper = createWrapper({ updateIsAvailable: true });
    const message = wrapper.get('.update-snackbar__message');

    expect(message.text()).toBe('update.optional');
  });

  test('trigger update does trigger the service worker assistant', () => {
    const wrapper = createWrapper({ updateIsAvailable: true });

    clickUpdateButton(wrapper);

    expect($serviceWorkerAssistant.update).toHaveBeenCalledTimes(1);
  });

  test('trigger update does not disconnect raiden service if not connected', () => {
    const wrapper = createWrapper({ updateIsAvailable: true, isConnected: false });

    clickUpdateButton(wrapper);

    expect($raiden.disconnect).toHaveBeenCalledTimes(0);
  });

  test('trigger update does disconnect raiden service if connected', () => {
    const wrapper = createWrapper({ updateIsAvailable: true, isConnected: true });

    clickUpdateButton(wrapper);

    expect($raiden.disconnect).toHaveBeenCalledTimes(1);
  });
});
