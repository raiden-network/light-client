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
  test('Should not show snackbar when online', async () => {
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

  test('Should show snackbar when offline', async () => {
    // @ts-ignore
    window.navigator.onLine = false;

    const wrapper = mount(OfflineSnackbar, {
      attachToDocument: true,
      mocks: {
        $t: (msg: string) => msg
      }
    });

    expect(wrapper.find('.v-snack').exists()).toBe(true);
  });
});
