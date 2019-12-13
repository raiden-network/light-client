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
      writable: true
    });
  });
  test('do not show the snackbar when there is a working connection', async () => {
    // @ts-ignore
    window.navigator.onLine = true;

    const wrapper = mount(OfflineSnackbar, {
      attachToDocument: true,
      mocks: {
        $t: (msg: string) => msg
      }
    });

    expect(wrapper.find('.v-snack').exists()).toBe(false);
  });

  test('show the snackbar when a working connection does not exist', async () => {
    // @ts-ignore
    window.navigator.onLine = false;

    const wrapper = mount(OfflineSnackbar, {
      attachToDocument: true,
      mocks: {
        $t: (msg: string) => msg
      }
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.v-snack').exists()).toBe(true);
  });
});
