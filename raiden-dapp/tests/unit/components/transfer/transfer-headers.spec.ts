import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import AmountDisplay from '@/components/AmountDisplay.vue';
import ChannelDepositDialog from '@/components/channels/ChannelDepositDialog.vue';
import TokenOverlay from '@/components/overlays/TokenOverlay.vue';
import TransferHeaders from '@/components/transfer/TransferHeaders.vue';
import { RouteNames } from '@/router/route-names';

import { generateChannel, generateToken } from '../../utils/data-generator';

import Mocked = jest.Mocked;

jest.mock('vue-router');

Vue.use(Vuex);
Vue.use(Vuetify);

const vuetify = new Vuetify();
const $router = new VueRouter() as Mocked<VueRouter>;
const token = generateToken();
const channel = generateChannel({}, token);
const getters = { channelWithBiggestCapacity: () => () => channel };

function createWrapper(options?: {
  noChannels?: boolean;
  totalCapacity?: BigNumber;
}): Wrapper<TransferHeaders> {
  const store = new Vuex.Store({ getters });

  return shallowMount(TransferHeaders, {
    vuetify,
    store,
    mocks: {
      $router,
      $t,
    },
    propsData: {
      token,
      noChannels: options?.noChannels ?? false,
      totalCapacity: options?.totalCapacity ?? constants.One,
    },
  });
}

describe('TransferHeaders.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('displays "no open channels" if no channels exist', () => {
    const wrapper = createWrapper({ noChannels: true });
    const amountDisplay = wrapper.find('.transfer-menus__capacity');

    expect(amountDisplay.text()).toContain('transfer.transfer-menus.no-channels');
  });

  test('displays capacity amount if a channe is open', () => {
    const wrapper = createWrapper({ totalCapacity: constants.Zero });
    const amountDisplay = wrapper.findComponent(AmountDisplay);

    expect(amountDisplay.exists()).toBeTruthy();
  });

  test('disables deposit button if no channels exist', () => {
    const wrapper = createWrapper({ noChannels: true });
    const depositButton = wrapper.find('.transfer-menus__dot-menu__menu__deposit');

    expect(depositButton.attributes('disabled')).toBeTruthy();
  });

  test('enables deposit button if channel capacity is zero', () => {
    const wrapper = createWrapper({ totalCapacity: constants.Zero });
    const depositButton = wrapper.find('.transfer-menus__dot-menu__menu__deposit');

    expect(depositButton.attributes('disabled')).toBeFalsy();
  });

  test('enables deposit button if channel has capacity', () => {
    const wrapper = createWrapper({ totalCapacity: constants.One });
    const depositButton = wrapper.find('.transfer-menus__dot-menu__menu__deposit');

    expect(depositButton.attributes('disabled')).toBeFalsy();
  });

  test('deposit button opens deposit dialog', async () => {
    const wrapper = createWrapper();
    const depositButton = wrapper.get('.transfer-menus__dot-menu__menu__deposit');

    depositButton.vm.$emit('click');
    await wrapper.vm.$nextTick();

    const channelDepositDialog = wrapper.findComponent(ChannelDepositDialog);
    expect(channelDepositDialog.exists()).toBeTruthy();
  });

  test('clicking change token button displays token overlay', async () => {
    const wrapper = createWrapper();
    const tokenSelectButton = wrapper.get('.transfer-menus__token-select').get('span');

    tokenSelectButton.trigger('click');
    await wrapper.vm.$nextTick();

    const tokenOverlay = wrapper.findComponent(TokenOverlay);
    expect(tokenOverlay.exists()).toBeTruthy();
  });

  test('clicking channels button navigates to channels screen', async () => {
    const wrapper = createWrapper();
    const channelsButton = wrapper.find('.transfer-menus__dot-menu__menu__channels');

    channelsButton.vm.$emit('click');
    await wrapper.vm.$nextTick();

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.CHANNELS,
      }),
    );
  });
});
