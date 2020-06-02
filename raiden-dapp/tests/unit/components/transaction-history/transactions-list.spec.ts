import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import store from '@/store';
import Vuetify from 'vuetify';
import TransactionsList from '@/components/transaction-history/TransactionsList.vue';

Vue.use(Vuetify);

describe('TransactionsList.vue', () => {
  let wrapper: Wrapper<TransactionsList>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(TransactionsList, {
      vuetify,
      store,
      mocks: {
        $t: (msg: string) => msg
      }
    });
  });

  test('displays transaction history title', () => {
    const transactionHistoryTitle = wrapper.find('.transaction-history__title');
    expect(transactionHistoryTitle.text()).toBe('transfer-history.title');
  });
});
