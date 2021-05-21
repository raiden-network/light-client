import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import type { RaidenTransfer } from 'raiden-ts';

import Transaction from '@/components/transaction-history/Transaction.vue';

import { generateToken, generateTransfer } from '../../utils/data-generator';

Vue.use(Vuetify);

describe('Transaction.vue', () => {
  const vuetify = new Vuetify();
  const token = generateToken();

  const createWrapper = (transferProp?: RaidenTransfer): Wrapper<Transaction> => {
    if (transferProp === undefined) {
      transferProp = generateTransfer({ success: true }, token);
    }

    return mount(Transaction, {
      vuetify,
      mocks: {
        $t: (msg: string) => msg,
        $store: {
          state: { tokens: { [token.address]: token } },
        },
      },
      propsData: {
        transfer: transferProp,
      },
    });
  };

  test('transaction item displays a "CONFIRMED" chip for successful transfers', () => {
    const wrapper = createWrapper();
    const confirmedTransferChip = wrapper.find('.v-chip__content');

    expect(confirmedTransferChip.text()).toBe('transfer-history.successful-transfer');
  });

  test('transaction item displays a "FAILED" chip for failed transfers', () => {
    const failedTransfer = generateTransfer({ success: false }, token);
    const wrapper = createWrapper(failedTransfer);
    const failedTransferChip = wrapper.find('.v-chip__content');

    expect(failedTransferChip.text()).toBe('transfer-history.failed-transfer');
  });

  test('transaction item displays a "PENDING" chip for pending transfers', () => {
    const pendingTransfer = generateTransfer({ success: undefined }, token);
    const wrapper = createWrapper(pendingTransfer);
    const pendingTransferChip = wrapper.find('.v-chip__content');

    expect(pendingTransferChip.text()).toBe('transfer-history.pending-transfer');
  });

  test('transaction item display correctly formatted date', () => {
    const wrapper = createWrapper();
    const transactionTimeStamp = wrapper.find('.transaction__details-left__time-stamp');
    expect(transactionTimeStamp.text()).toContain('6/5/1986 11:00:00 PM');
  });
});
