import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';
import UpdateSnackbar from '@/components/UpdateSnackbar.vue';

Vue.use(Vuetify);
Vue.use(Vuex);

const $raiden = {
  disconnect: jest.fn(async () => undefined),
};

const $serviceWorkerAssistant = {
  update: jest.fn(),
};

function createWrapper(
  isConnected = false,
  versionUpdateAvailable = false,
): Wrapper<UpdateSnackbar> {
  const vuetify = new Vuetify();
  const getters = {
    isConnected: () => isConnected,
    versionUpdateAvailable: () => versionUpdateAvailable,
  };

  const store = new Vuex.Store({ getters });

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

  test('does not render snackbar if there is no update available', async () => {
    const wrapper = createWrapper();
    const snackbar = wrapper.find('.update-snackbar');

    expect(snackbar.exists()).toBe(false);
  });

  test('render snackbar if update is available', async () => {
    const wrapper = createWrapper(undefined, true);
    const snackbar = wrapper.find('.update-snackbar');

    expect(snackbar.exists()).toBe(true);
  });

  test('trigger update does trigger the service worker assistant', () => {
    const wrapper = createWrapper(false, true);

    clickUpdateButton(wrapper);

    expect($serviceWorkerAssistant.update).toHaveBeenCalledTimes(1);
  });

  test('trigger update does not disconnect raiden service if not connected', () => {
    const wrapper = createWrapper(false, true);

    clickUpdateButton(wrapper);

    expect($raiden.disconnect).toHaveBeenCalledTimes(0);
  });

  test('trigger update does disconnect raiden service if connected', () => {
    const wrapper = createWrapper(true, true);

    clickUpdateButton(wrapper);

    expect($raiden.disconnect).toHaveBeenCalledTimes(1);
  });
});
