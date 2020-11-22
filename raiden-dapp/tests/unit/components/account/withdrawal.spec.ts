jest.mock('@/i18n', () => jest.fn());
import flushPromises from 'flush-promises';
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import { BigNumber } from 'ethers';
import { $identicon } from '../../utils/mocks';
import Withdrawal from '@/components/account/Withdrawal.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import RaidenService from '@/services/raiden-service';

Vue.use(Vuex);
Vue.use(Vuetify);

let vuetify: Vuetify;
let $raiden: Partial<RaidenService>;

const tokenBalance = BigNumber.from('1000000');
const tokenNoBalance = BigNumber.from('0');
const raidenBalance = '1000000';
const raidenNoBalance = '0';

function createWrapper(
  tokenBalance: BigNumber,
  raidenAccountBalance: string,
): Wrapper<Withdrawal> {
  $raiden = {
    getTokenBalance: jest.fn().mockResolvedValue(tokenBalance),
    transferOnChainTokens: jest.fn(),
    fetchAndUpdateTokenData: jest.fn().mockResolvedValue(undefined),
  };

  const state = {
    raidenAccountBalance,
  };

  const getters = {
    allTokens: () => [],
  };

  const userDepositContractModule = {
    namespaced: true,
    state: {
      token: {
        address: '0xuserdeposittoken',
        balance: BigNumber.from('0'),
      },
    },
  };

  const store = new Vuex.Store({
    state,
    getters,
    modules: { userDepositContract: userDepositContractModule },
  });

  return mount(Withdrawal, {
    vuetify,
    store,
    stubs: ['v-dialog', 'i18n'],
    mocks: {
      $identicon: $identicon(),
      $t: (msg: string) => msg,
      $raiden,
    },
  });
}

describe('Withdrawal.vue', () => {
  test('can withdraw tokens', async () => {
    const wrapper = createWrapper(tokenBalance, raidenBalance);
    await flushPromises();

    wrapper.find('.withdrawal__token-list__item__button').trigger('click');
    await wrapper.vm.$nextTick();

    const confirmButton = wrapper.findComponent(RaidenDialog).findAll('button').at(1);
    confirmButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect($raiden.transferOnChainTokens).toHaveBeenCalledTimes(1);
  });

  test('displays empty screen if there are no tokens to withdraw', async () => {
    const wrapper = createWrapper(tokenNoBalance, raidenBalance);
    await flushPromises();

    expect(wrapper.find('.withdrawal__empty').exists()).toBe(true);
  });

  test('disaples withdrawal confirm button if Raiden account has no balance', async () => {
    const wrapper = createWrapper(tokenBalance, raidenNoBalance);
    await flushPromises();

    wrapper.find('.withdrawal__token-list__item__button').trigger('click');
    await wrapper.vm.$nextTick();

    const confirmButton = wrapper.findComponent(RaidenDialog).findAll('button').at(1);

    expect(confirmButton.attributes()['disabled']).toBe('disabled');
  });
});
