import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import BlurredOverlay from '@/components/overlays/BlurredOverlay.vue';
import VersionSnackbar from '@/components/VersionSnackbar.vue';

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
  correctVersionIsLoaded?: boolean;
}): Wrapper<VersionSnackbar> {
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
      correctVersionIsLoaded: () => options?.correctVersionIsLoaded ?? true,
    },
  };

  const store = new Vuex.Store({
    state,
    modules: { versionInformation: versionInformationModule },
  });

  return mount(VersionSnackbar, {
    vuetify,
    store,
    mocks: {
      $raiden,
      $serviceWorkerAssistant,
      $t: (msg: string) => msg,
    },
  });
}

function clickUpdateButton(wrapper: Wrapper<VersionSnackbar>): void {
  const button = wrapper.get('button');
  button.trigger('click');
}

describe('VersionSnackbar.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('render snackbar', () => {
    test('not if correct version is loaded and no update is available or mandatory', async () => {
      const wrapper = createWrapper({ updateIsAvailable: false, updateIsMandatory: false });
      const snackbar = wrapper.find('.version-snackbar');

      expect(snackbar.exists()).toBe(false);
    });

    test('if not the correct version got loaded', () => {
      const wrapper = createWrapper({ correctVersionIsLoaded: false });
      const snackbar = wrapper.find('.version-snackbar');

      expect(snackbar.exists()).toBe(true);
    });

    test('if update is available', () => {
      const wrapper = createWrapper({ updateIsAvailable: true });
      const snackbar = wrapper.find('.version-snackbar');

      expect(snackbar.exists()).toBe(true);
    });

    test('if update is mandatory', () => {
      const wrapper = createWrapper({ updateIsMandatory: true });
      const snackbar = wrapper.find('.version-snackbar');

      expect(snackbar.exists()).toBe(true);
    });
  });

  describe('render blocking overlay', () => {
    test('if wrong version is loaded', () => {
      const wrapper = createWrapper({ correctVersionIsLoaded: false });
      const overlay = wrapper.findComponent(BlurredOverlay);

      expect(overlay.exists()).toBe(true);
    });

    test('if update is mandatory', () => {
      const wrapper = createWrapper({ updateIsMandatory: true });
      const overlay = wrapper.findComponent(BlurredOverlay);

      expect(overlay.exists()).toBe(true);
    });
  });

  describe('render message', () => {
    test('not if wrong version is loaded', () => {
      const wrapper = createWrapper({ correctVersionIsLoaded: false });
      const message = wrapper.get('.version-snackbar__message');

      expect(message.isVisible()).toBeFalsy();
    });

    test('if update is available', () => {
      const wrapper = createWrapper({ updateIsAvailable: true });
      const message = wrapper.get('.version-snackbar__message');

      expect(message.isVisible()).toBeTruthy();
      expect(message.text()).toBe('update.optional');
    });

    test('if update is mandatory', () => {
      const wrapper = createWrapper({ updateIsAvailable: true });
      const message = wrapper.get('.version-snackbar__message');

      expect(message.isVisible()).toBeTruthy();
      expect(message.text()).toBe('update.optional');
    });
  });

  describe('triggering the update button', () => {
    test('triggers update on the service worker assistant', () => {
      const wrapper = createWrapper({ updateIsAvailable: true });

      clickUpdateButton(wrapper);

      expect($serviceWorkerAssistant.update).toHaveBeenCalledTimes(1);
    });

    test('does not disconnect the raiden service if not connected', () => {
      const wrapper = createWrapper({ updateIsAvailable: true, isConnected: false });

      clickUpdateButton(wrapper);

      expect($raiden.disconnect).toHaveBeenCalledTimes(0);
    });

    test('disconnects the raiden service if connected', () => {
      const wrapper = createWrapper({ updateIsAvailable: true, isConnected: true });

      clickUpdateButton(wrapper);

      expect($raiden.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
