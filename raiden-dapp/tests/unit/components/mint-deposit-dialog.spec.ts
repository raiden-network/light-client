import { mount, Wrapper } from '@vue/test-utils';
import MintDepositDialog from '@/components/MintDepositDialog.vue';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { Zero } from 'ethers/constants';
import { Token } from '@/model/types';
import store from '@/store/index';
import flushPromises from 'flush-promises';
import { bigNumberify } from 'ethers/utils';

Vue.use(Vuetify);

describe('MintDepositDialog.vue', () => {
  let vuetify: typeof Vuetify;
  let wrapper: Wrapper<MintDepositDialog>;

  const $raiden = {
    userDepositTokenAddress: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    mint: jest.fn(),
    depositToUDC: jest.fn()
  };

  const token = {
    address: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    name: 'Test Token',
    symbol: 'TTT',
    decimals: 18,
    balance: Zero
  } as Token;

  function createWrapper(): Wrapper<MintDepositDialog> {
    vuetify = new Vuetify();
    return mount(MintDepositDialog, {
      vuetify,
      store,
      sync: false,
      mocks: {
        $t: (msg: string) => msg,
        $raiden
      }
    });
  }

  beforeEach(() => {
    store.commit('updateTokens', {
      '0x3a989D97388a39A0B5796306C615d10B7416bE77': token
    });
    wrapper = createWrapper();
    jest.resetAllMocks();
  });

  test('minting is successful', async () => {
    expect.assertions(3);
    $raiden.mint.mockResolvedValueOnce(undefined);
    $raiden.depositToUDC.mockResolvedValueOnce(undefined);
    wrapper.find('.mint-deposit-dialog__action button').trigger('click');
    await flushPromises();
    expect($raiden.mint).toHaveBeenCalledTimes(1);
    expect($raiden.depositToUDC).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted()['done']).toHaveLength(1);
  });

  test('minting fails', async () => {
    expect.assertions(4);
    $raiden.mint.mockRejectedValueOnce(new Error('error'));
    wrapper.find('.mint-deposit-dialog__action button').trigger('click');
    await flushPromises();
    expect($raiden.mint).toHaveBeenCalledTimes(1);
    expect($raiden.depositToUDC).toHaveBeenCalledTimes(0);
    const errorText = wrapper.find('.error--text');
    expect(errorText.exists()).toBe(true);
    expect(errorText.text()).toMatch('error');
  });

  test('user has already enough tokens', async () => {
    expect.assertions(3);
    store.commit('updateTokens', {
      '0x3a989D97388a39A0B5796306C615d10B7416bE77': {
        ...token,
        balance: bigNumberify('10000000000000000000')
      }
    });

    $raiden.mint.mockResolvedValueOnce(undefined);
    $raiden.depositToUDC.mockResolvedValueOnce(undefined);
    wrapper.find('.mint-deposit-dialog__action button').trigger('click');
    await flushPromises();
    expect($raiden.mint).toHaveBeenCalledTimes(0);
    expect($raiden.depositToUDC).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted()['done']).toHaveLength(1);
  });
});
