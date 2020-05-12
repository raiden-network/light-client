import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';

jest.mock('@/services/raiden-service');

import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import store from '@/store';
import { $identicon } from '../../utils/mocks';
import Withdrawal from '@/components/account/Withdrawal.vue';
import RaidenService from '@/services/raiden-service';
import Mocked = jest.Mocked;
import { parseEther, parseUnits } from 'ethers/utils';

Vue.use(Vuetify);

describe('Withdrawal.vue', () => {
  let wrapper: Wrapper<Withdrawal>;
  let vuetify: typeof Vuetify;
  let $raiden: Mocked<RaidenService>;

  function createWrapper() {
    return mount(Withdrawal, {
      vuetify,
      store,
      stubs: ['v-dialog', 'i18n'],
      mocks: {
        $identicon: $identicon(),
        $t: (msg: string) => msg,
        $raiden
      }
    });
  }

  beforeEach(() => {
    vuetify = new Vuetify();
    $raiden = new RaidenService(store) as Mocked<RaidenService>;
  });

  describe('no tokens', () => {
    beforeEach(() => {
      $raiden.getRaidenAccountBalances.mockResolvedValue([]);
      wrapper = createWrapper();
    });

    test('render component', () => {
      expect(wrapper.is(Withdrawal)).toBe(true);
    });

    test('show an empty screen', () => {
      expect(wrapper.find('.withdrawal__empty').exists()).toBe(true);
    });
  });

  describe('with tokens', () => {
    beforeEach(() => {
      $raiden.getRaidenAccountBalances.mockResolvedValue([
        {
          address: '0xtoken',
          decimals: 5,
          balance: parseUnits('1.2', 5),
          name: 'TestToken',
          symbol: 'TTT'
        }
      ]);
      wrapper = createWrapper();
    });

    test('open a dialog when clicking withdraw for a token', async () => {
      wrapper
        .find('.withdrawal__tokens')
        .find('button')
        .trigger('click');

      await wrapper.vm.$nextTick();

      expect(wrapper.find(RaidenDialog).exists()).toBe(true);
    });

    test('disables withdrawal if the Raiden account has no funds', async () => {
      wrapper
        .find('.withdrawal__tokens')
        .find('button')
        .trigger('click');

      await wrapper.vm.$nextTick();

      expect(
        wrapper
          .find('.withdrawal-dialog__action')
          .find('button')
          .attributes()['disabled']
      ).toBe('disabled');
    });

    test('withdraws tokens when the user clicks on the action button', async () => {
      store.commit('raidenAccountBalance', parseEther('1.2'));
      wrapper
        .find('.withdrawal__tokens')
        .find('button')
        .trigger('click');

      await wrapper.vm.$nextTick();

      expect(
        wrapper
          .find('.withdrawal-dialog__action')
          .find('button')
          .attributes()['disabled']
      ).toBeUndefined();

      wrapper
        .find('.withdrawal-dialog__action')
        .find('button')
        .trigger('click');

      await wrapper.vm.$nextTick();
      expect($raiden.transferOnChainTokens).toHaveBeenCalledTimes(1);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.withdrawal__empty').exists()).toBe(true);
    });

    test('withdraw is no-op without a selection', async () => {
      await (wrapper.vm as any).withdrawTokens();
      expect($raiden.transferOnChainTokens).toHaveBeenCalledTimes(0);
    });
  });
});
