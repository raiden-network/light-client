import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { BigNumber } from 'ethers/utils';
import Transaction from '@/components/transaction-history/Transaction.vue';

Vue.use(Vuetify);

describe('Transaction.vue', () => {
  let wrapper: Wrapper<Transaction>;
  let vuetify: typeof Vuetify;

  const createWrapper = (
    transferDirection: string,
    successStatus: boolean | undefined
  ) => {
    vuetify = new Vuetify();
    return mount(Transaction, {
      vuetify,
      mocks: {
        $t: (msg: string) => msg
      },
      propsData: {
        transfer: {
          amount: new BigNumber(10 ** 8),
          changedAt: new Date('June 5, 1986 23:59:59'),
          direction: transferDirection,
          partner: '0x123',
          success: successStatus,
          token: '0xtoken'
        }
      }
    });
  };

  test('transactions are prefixed with "sent to" for sent transfers', () => {
    wrapper = createWrapper('sent', true);
    const transactionHistoryDirection = wrapper.find(
      '.transaction__item__details-left'
    );
    expect(transactionHistoryDirection.text()).toContain(
      'transfer-history.sent-title'
    );
  });

  test('transactions are prefixed with "Received from" for received transfers', () => {
    wrapper = createWrapper('received', true);
    const transactionHistoryDirection = wrapper.find(
      '.transaction__item__details-left'
    );
    expect(transactionHistoryDirection.text()).toContain(
      'transfer-history.received-title'
    );
  });

  test('transaction item displays a "CONFIRMED" chip for successful transfers', () => {
    wrapper = createWrapper('sent', true);
    const confirmedTransferChip = wrapper.find('.v-chip__content');
    expect(confirmedTransferChip.text()).toBe(
      'transfer-history.successful-transfer'
    );
  });

  test('transaction item displays a "FAILED" chip for failed transfers', () => {
    wrapper = createWrapper('sent', false);
    const failedTransferChip = wrapper.find('.v-chip__content');
    expect(failedTransferChip.text()).toBe('transfer-history.failed-transfer');
  });

  test('transaction item displays a "PENDING" chip for pending transfers', () => {
    wrapper = createWrapper('sent', undefined);
    const pendingTransferChip = wrapper.find('.v-chip__content');
    expect(pendingTransferChip.text()).toBe(
      'transfer-history.pending-transfer'
    );
  });

  test('transaction item display correctly formatted date', () => {
    wrapper = createWrapper('sent', true);
    const transactionTimeStamp = wrapper.find(
      '.transaction__item__details-left__time-stamp'
    );
    expect(transactionTimeStamp.text()).toContain('6/5/1986');
    expect(transactionTimeStamp.text()).toContain('11:59:59 PM');
  });
});
