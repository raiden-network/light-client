import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';

import ChannelDepositDialog from '@/components/dialogs/ChannelDepositDialog.vue';
import TokenOverlay from '@/components/overlays/TokenOverlay.vue';
import TransferHeaders from '@/components/transfer/TransferHeaders.vue';
import { RouteNames } from '@/router/route-names';
import store from '@/store';

import { generateToken } from '../../utils/data-generator';

import Mocked = jest.Mocked;

jest.mock('vue-router');

Vue.use(Vuetify);

describe('TransferHeaders.vue', () => {
  const vuetify = new Vuetify();
  let router: Mocked<VueRouter>;
  const token = generateToken();

  const createWrapper = (
    noChannels: boolean,
    totalCapacity: BigNumber,
  ): Wrapper<TransferHeaders> => {
    router = new VueRouter() as Mocked<VueRouter>;

    return mount(TransferHeaders, {
      vuetify,
      store,
      stubs: ['v-menu', 'v-dialog'],
      mocks: {
        $router: router,
        $t: (msg: string) => msg,
        $raiden: {
          fetchAndUpdateTokenData: jest.fn(),
        },
      },
      propsData: {
        token,
        noChannels,
        totalCapacity,
      },
    });
  };

  test('displays "no open channels" if no channels exist', () => {
    const wrapper = createWrapper(true, constants.Zero);
    const amountDisplay = wrapper.find('.transfer-menus__capacity');

    expect(amountDisplay.text()).toContain('transfer.transfer-menus.no-channels');
  });

  test('displays zero amount if channel has no capacity', () => {
    const wrapper = createWrapper(false, constants.Zero);
    const amountDisplay = wrapper.find('.transfer-menus__capacity');

    expect(amountDisplay.find('div').text()).toContain('0');
  });

  test('displays amount if channel has capacity', () => {
    const wrapper = createWrapper(false, constants.One);
    const amountDisplay = wrapper.find('.transfer-menus__capacity');

    expect(amountDisplay.find('div').text()).toContain('0.000001');
  });

  test('disables deposit button if no channels exist', () => {
    const wrapper = createWrapper(true, constants.Zero);
    const depositButton = wrapper.find('.transfer-menus__dot-menu__menu__deposit');

    expect(depositButton.attributes()['disabled']).toBe('disabled');
  });

  test('enables deposit button if channel capacity is zero', () => {
    const wrapper = createWrapper(false, constants.Zero);
    const depositButton = wrapper.find('.transfer-menus__dot-menu__menu__deposit');

    expect(depositButton.attributes()).not.toMatchObject(
      expect.objectContaining({ disabled: 'disabled' }),
    );
  });

  test('enables deposit button if channel has capacity', () => {
    const wrapper = createWrapper(false, constants.One);
    const depositButton = wrapper.find('.transfer-menus__dot-menu__menu__deposit');

    expect(depositButton.attributes()).not.toMatchObject(
      expect.objectContaining({ disabled: 'disabled' }),
    );
  });

  test('deposit button opens deposit dialog', async () => {
    const wrapper = createWrapper(false, constants.One);
    const depositButton = wrapper.find('.transfer-menus__dot-menu__menu__deposit');

    depositButton.trigger('click');
    await wrapper.vm.$nextTick();

    const channelDepositDialog = wrapper
      .findComponent(ChannelDepositDialog)
      .find('.channel-deposit');

    expect(channelDepositDialog.exists()).toBe(true);
  });

  test('clicking change token button displays token overlay', async () => {
    const wrapper = createWrapper(false, constants.One);

    const tokenSelectButton = wrapper.findAll('span').at(0);

    tokenSelectButton.trigger('click');
    await wrapper.vm.$nextTick();

    const tokenOverlay = wrapper.findComponent(TokenOverlay).find('.v-overlay--active');
    expect(tokenOverlay.exists()).toBe(true);
  });

  test('clicking channels button navigates to channels screen', async () => {
    router.push = jest.fn().mockImplementation(() => Promise.resolve());

    const wrapper = createWrapper(false, constants.One);
    const channelsButton = wrapper.find('.transfer-menus__dot-menu__menu__channels');

    channelsButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.CHANNELS,
      }),
    );
  });
});
