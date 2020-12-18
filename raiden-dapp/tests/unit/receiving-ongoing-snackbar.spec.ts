import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import ReceivingOngoingSnackbar from '@/components/ReceivingOngoingSnackbar.vue';

Vue.use(Vuetify);
Vue.use(Vuex);

const createWrapper = (
  receivedTransfer: boolean | undefined = undefined,
): Wrapper<ReceivingOngoingSnackbar> => {
  const vuetify = new Vuetify();
  const getters = {
    pendingTransfers: () => ({ 0: { success: receivedTransfer, direction: 'received' } }),
  };
  const store = new Vuex.Store({ getters });

  return mount(ReceivingOngoingSnackbar, {
    vuetify,
    store,
    mocks: {
      $t: (msg: string) => msg,
    },
  });
};

describe('ReceivingOngoingSnackbar.vue', () => {
  test('snackbar is displayed while receiving a transfer', () => {
    const wrapper = createWrapper();
    const snackbar = wrapper.find('.v-snack__wrapper');

    expect(snackbar.attributes('style')).toBe(undefined);
  });

  test('snackbar is not displayed when a transfer has been received', () => {
    const wrapper = createWrapper(true);
    const snackbar = wrapper.find('.v-snack__wrapper');

    expect(snackbar.attributes('style')).toContain('display: none');
  });
});
