import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';
import UpdateSnackbar from '@/components/UpdateSnackbar.vue';
import BlurredOverlay from '@/components/overlays/BlurredOverlay.vue';

Vue.use(Vuetify);
Vue.use(Vuex);

const $raiden = {
  disconnect: jest.fn(async () => undefined),
};

const $serviceWorkerAssistant = {
  update: jest.fn(),
};

function createWrapper(
  versionUpdateAvailable = false,
  updateIsMandatory = false,
  isConnected = false,
): Wrapper<UpdateSnackbar> {
  const vuetify = new Vuetify();
  const state = {
    versionInfo: {
      updateIsMandatory,
    },
  };
  const getters = {
    isConnected: () => isConnected,
    versionUpdateAvailable: () => versionUpdateAvailable,
  };

  const store = new Vuex.Store({ state, getters });

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
    const wrapper = createWrapper(false, false);
    const snackbar = wrapper.find('.update-snackbar');

    expect(snackbar.exists()).toBe(false);
  });

  test('render snackbar if update is available', () => {
    const wrapper = createWrapper(true);
    const snackbar = wrapper.find('.update-snackbar');

    expect(snackbar.exists()).toBe(true);
  });

  test('render snackbar if update is mandatory', () => {
    const wrapper = createWrapper(undefined, true);
    const snackbar = wrapper.find('.update-snackbar');

    expect(snackbar.exists()).toBe(true);
  });

  test('render blocking overlay if update is mandatory', () => {
    const wrapper = createWrapper(undefined, true);
    const overlay = wrapper.findComponent(BlurredOverlay);

    expect(overlay.exists()).toBe(true);
  });

  test('render message that update is available', () => {
    const wrapper = createWrapper(true);
    const message = wrapper.get('.update-snackbar__message');

    expect(message.text()).toBe('update.optional');
  });

  test('render message that update is mandatory', () => {
    const wrapper = createWrapper(true);
    const message = wrapper.get('.update-snackbar__message');

    expect(message.text()).toBe('update.optional');
  });

  test('trigger update does trigger the service worker assistant', () => {
    const wrapper = createWrapper(true);

    clickUpdateButton(wrapper);

    expect($serviceWorkerAssistant.update).toHaveBeenCalledTimes(1);
  });

  test('trigger update does not disconnect raiden service if not connected', () => {
    const wrapper = createWrapper(true, undefined, false);

    clickUpdateButton(wrapper);

    expect($raiden.disconnect).toHaveBeenCalledTimes(0);
  });

  test('trigger update does disconnect raiden service if connected', () => {
    const wrapper = createWrapper(true, undefined, true);

    clickUpdateButton(wrapper);

    expect($raiden.disconnect).toHaveBeenCalledTimes(1);
  });
});
