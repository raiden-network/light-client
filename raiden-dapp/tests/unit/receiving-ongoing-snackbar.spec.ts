import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import { generateTransfer } from './utils/data-generator';
import { RaidenTransfer } from 'raiden-ts';
import ReceivingOngoingSnackbar from '@/components/ReceivingOngoingSnackbar.vue';

Vue.use(Vuetify);
Vue.use(Vuex);

const pendingSentTransfer = generateTransfer({ completed: false, direction: 'sent' });
const pendingReceivedTransfer = generateTransfer({ completed: false, direction: 'received' });

function createWrapper(pendingTransfers: RaidenTransfer[]): Wrapper<ReceivingOngoingSnackbar> {
  const vuetify = new Vuetify();
  const getters = {
    pendingTransfers: () => pendingTransfers,
  };
  const store = new Vuex.Store({ getters });

  return mount(ReceivingOngoingSnackbar, {
    vuetify,
    store,
    mocks: {
      $t: (msg: string) => msg,
    },
  });
}

function getSnackbar(wrapper: Wrapper<ReceivingOngoingSnackbar>) {
  return wrapper.find('.receiving-ongoing-snackbar');
}

describe('ReceivingOngoingSnackbar.vue', () => {
  test('snackbar is displayed while receiving a transfer', () => {
    const wrapper = createWrapper([pendingReceivedTransfer]);
    const snackbar = getSnackbar(wrapper);

    expect(snackbar.exists()).toBe(true);
  });

  test('snackbar is not displayed when a pending transfer is sent', () => {
    const wrapper = createWrapper([pendingSentTransfer]);
    const snackbar = getSnackbar(wrapper);

    expect(snackbar.exists()).toBe(false);
  });

  test('snackbar is not displayed if no transfers are pending', () => {
    const wrapper = createWrapper([]);
    const snackbar = getSnackbar(wrapper);

    expect(snackbar.exists()).toBe(false);
  });
});
