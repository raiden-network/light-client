import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { generateToken, generateTransfer } from '../../utils/data-generator';
import Transaction from '@/components/transaction-history/Transaction.vue';
import { RaidenTransfer } from 'raiden-ts';

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
  test('transactions are prefixed with "sent to" for sent transfers', () => {
    const wrapper = createWrapper();
    const transactionHistoryDirection = wrapper.find('.transaction__item__details-left');

    expect(transactionHistoryDirection.text()).toContain('transfer-history.sent-title');
  });

  test('transactions are prefixed with "Received from" for received transfers', () => {
    const receivedTransfer = generateTransfer({ direction: 'received' }, token);
    const wrapper = createWrapper(receivedTransfer);
    const transactionHistoryDirection = wrapper.find('.transaction__item__details-left');

    expect(transactionHistoryDirection.text()).toContain('transfer-history.received-title');
  });

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
    const transactionTimeStamp = wrapper.find('.transaction__item__details-left__time-stamp');
    expect(transactionTimeStamp.text()).toContain('6/5/1986');
    expect(transactionTimeStamp.text()).toContain('11:59:59 PM');
  });
});
