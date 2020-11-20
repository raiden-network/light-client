import { shallowMount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { generateToken, generateTransfer } from '../../utils/data-generator';
import { RaidenTransfer } from 'raiden-ts';
import Transaction from '@/components/transaction-history/Transaction.vue';
import TransactionList from '@/components/transaction-history/TransactionList.vue';
import { Token } from '@/model/types';
import { Transfers } from '@/types';

Vue.use(Vuetify);

describe('TransactionList.vue', () => {
  const vuetify = new Vuetify();
  const token = generateToken();
  const transfers = [generateTransfer({}, token), generateTransfer({}, token)];

  const createWrapper = (
    tokenProp?: Token,
    transferList: RaidenTransfer[] = transfers,
  ): Wrapper<TransactionList> => {
    const transfersState: Transfers = {};
    transferList.forEach((transfer) => (transfersState[transfer.key] = transfer));

    return shallowMount(TransactionList, {
      vuetify,
      mocks: {
        $t: (msg: string) => msg,
        $store: { state: { transfers: transfersState } },
      },
      propsData: {
        token: tokenProp,
      },
    });
  };

  test('transaction list without filter includes all transfers', () => {
    const wrapper = createWrapper();
    const transactionEntries = wrapper.findAllComponents(Transaction);

    expect(transactionEntries.length).toEqual(2);
  });

  test('transaction list applies token filter', () => {
    const newToken = generateToken();
    const transfer = generateTransfer({}, newToken);
    const wrapper = createWrapper(newToken, [transfer]);
    const transactionEntries = wrapper.findAllComponents(Transaction);

    expect(transactionEntries.length).toEqual(1);
  });

  test('transaction list is empty for token filter without transactions', () => {
    const tokenWithoutTransfers = generateToken();
    const wrapper = createWrapper(tokenWithoutTransfers);
    const transactionEntries = wrapper.findAllComponents(Transaction);

    expect(transactionEntries.length).toEqual(0);
  });

  test('transaction list is stored by date', () => {
    const wrapper = createWrapper();
    const transactionEntries = wrapper.findAllComponents(Transaction);
    const orderAsIs = transactionEntries.wrappers.map((entry) => entry.props().transfer.changedAt);
    const correctOrder = orderAsIs.sort();

    expect(orderAsIs).toEqual(correctOrder);
  });
});
