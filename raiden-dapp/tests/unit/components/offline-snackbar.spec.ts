import { mount } from '@vue/test-utils';
import OfflineSnackbar from '@/components/OfflineSnackbar.vue';
import Vuetify from 'vuetify';
import Vue from 'vue';

Vue.use(Vuetify);

describe('OfflineSnackbar.vue', () => {
  beforeAll(() => {
    window.addEventListener = jest.fn().mockReturnValue(null);
    window.removeEventListener = jest.fn().mockReturnValue(null);

    // Workaround to make window.navigator.onLine writable
    Object.defineProperty(window.navigator, 'onLine', {
      value: true,
      writable: true,
    });
  });
  test('do not show the snackbar when there is a working connection', async () => {
    (window.navigator as any).onLine = true;

    const vuetify = new Vuetify();
    const wrapper = mount(OfflineSnackbar, {
      vuetify,
      attachToDocument: true,
      mocks: {
        $t: (msg: string) => msg,
      },
    });

    expect(wrapper.find('.v-snack').exists()).toBe(false);
  });

  test('show the snackbar when a working connection does not exist', async () => {
    (window.navigator as any).onLine = false;

    const vuetify = new Vuetify();
    const wrapper = mount(OfflineSnackbar, {
      vuetify,
      attachToDocument: true,
      mocks: {
        $t: (msg: string) => msg,
      },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.v-snack').exists()).toBe(true);
  });
});
