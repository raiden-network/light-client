import { mount, Wrapper } from '@vue/test-utils';
import UdcDepositDialog from '@/components/dialogs/UdcDepositDialog.vue';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { Zero } from 'ethers/constants';
import { Token } from '@/model/types';
import store from '@/store';
import flushPromises from 'flush-promises';
import { bigNumberify } from 'ethers/utils';

Vue.use(Vuetify);

describe('UdcDepositDialog.vue', () => {
  let vuetify: Vuetify;
  let wrapper: Wrapper<UdcDepositDialog>;

  const $raiden = {
    userDepositTokenAddress: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    mint: jest.fn(),
    depositToUDC: jest.fn(),
    getMainAccount: jest.fn(),
    getAccount: jest.fn(),
    getTokenBalance: jest.fn(),
  };

  const token = {
    address: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    name: 'Test Token',
    symbol: 'TTT',
    decimals: 18,
    balance: Zero,
  } as Token;

  function createWrapper(): Wrapper<UdcDepositDialog> {
    vuetify = new Vuetify();
    return mount(UdcDepositDialog, {
      vuetify,
      store,
      stubs: ['v-dialog'],
      mocks: {
        $t: (msg: string) => msg,
        $raiden,
      },
      propsData: {
        visible: true,
      },
    });
  }

  describe('depositing on testnet', () => {
    beforeEach(() => {
      store.commit(
        'userDepositTokenAddress',
        '0x3a989D97388a39A0B5796306C615d10B7416bE77'
      );
      store.commit('updateTokens', {
        '0x3a989D97388a39A0B5796306C615d10B7416bE77': token,
      });
      wrapper = createWrapper();
      jest.resetAllMocks();
    });

    test('emit a done event when the mint and deposit is successful', async () => {
      expect.assertions(3);
      $raiden.depositToUDC.mockImplementation(async (_, call: () => void) => {
        call();
      });
      wrapper.find('.udc-deposit-dialog__action button').trigger('click');
      await flushPromises();
      expect($raiden.mint).toHaveBeenCalledTimes(1);
      expect($raiden.depositToUDC).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted()['done']).toHaveLength(1);
    });

    test('show an error message when the minting fails', async () => {
      expect.assertions(3);
      $raiden.mint.mockRejectedValueOnce(new Error('error'));
      wrapper.find('.udc-deposit-dialog__action button').trigger('click');
      await flushPromises();
      expect($raiden.mint).toHaveBeenCalledTimes(1);
      expect($raiden.depositToUDC).toHaveBeenCalledTimes(0);
      expect(wrapper.vm.$data.error).toMatchObject({ message: 'error' });
    });

    test('do not mint when the user has already enough tokens', async () => {
      expect.assertions(3);
      store.commit('updateTokens', {
        '0x3a989D97388a39A0B5796306C615d10B7416bE77': {
          ...token,
          balance: bigNumberify('10000000000000000000'),
        },
      });

      wrapper.find('.udc-deposit-dialog__action button').trigger('click');
      await flushPromises();
      expect($raiden.mint).toHaveBeenCalledTimes(0);
      expect($raiden.depositToUDC).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted()['done']).toHaveLength(1);
    });
  });

  describe('depositing on mainnet', () => {
    beforeEach(() => {
      store.commit(
        'userDepositTokenAddress',
        '0x3a989D97388a39A0B5796306C615d10B7416bE77'
      );
      store.commit('updateTokens', {
        '0x3a989D97388a39A0B5796306C615d10B7416bE77': {
          ...token,
          balance: bigNumberify('10000000000000000000'),
        },
      });
      store.commit('network', { name: 'mainnet', chainId: 1 });

      wrapper = createWrapper();
      jest.resetAllMocks();
    });

    test('mainnet is used', () => {
      expect((wrapper.vm as any).mainnet).toBe(true);
    });

    test('displays uniswap URL', () => {
      expect(wrapper.vm.$data.uniswapURL).toBe(
        'udc-deposit-dialog.uniswap-url'
      );
    });

    test('amount validates to true if inputted amount is lower or equal to available amount', async () => {
      const inputField = wrapper.find('input');
      inputField.setValue('5.55');
      await wrapper.vm.$nextTick();

      expect((wrapper.vm as any).valid).toBe(true);

      inputField.setValue('10');
      await wrapper.vm.$nextTick();

      expect((wrapper.vm as any).valid).toBe(true);
    });

    test('amount validates to false if inputted amount is higher than available amount', async () => {
      const inputField = wrapper.find('input');
      inputField.setValue('50');
      await wrapper.vm.$nextTick();

      expect((wrapper.vm as any).valid).toBe(false);
    });
  });
});
