jest.mock('vue-router');
jest.mock('@/services/raiden-service');
jest.useFakeTimers();

import { Token } from '@/model/types';
import { ChannelState } from 'raiden-ts';
import { mockInput } from '../../utils/interaction-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import Transfer from '@/components/navigation/Transfer.vue';
import store from '@/store';
import VueRouter from 'vue-router';
import { TestData } from '../../data/mock-data';
import RaidenService from '@/services/raiden-service';
import { One, Zero } from 'ethers/constants';
import { BigNumber } from 'ethers/utils';
import { $identicon } from '../../utils/mocks';

jest.mock('@/i18n', () => jest.fn());

import Mocked = jest.Mocked;
import { RouteNames } from '@/router/route-names';

Vue.use(Vuetify);

describe('Transfer.vue', () => {
  let wrapper: Wrapper<Transfer>;
  let router: Mocked<VueRouter>;
  let raiden: Mocked<RaidenService>;
  let loading: jest.SpyInstance;
  let done: jest.SpyInstance;
  let vuetify: typeof Vuetify;

  const token: Token = {
    address: '0xtoken',
    balance: One,
    decimals: 18,
    symbol: 'TTT',
    name: 'Test Token'
  };

  function createWrapper(
    router: VueRouter,
    raiden: RaidenService
  ): Wrapper<Transfer> {
    vuetify = new Vuetify();

    const options = {
      vuetify,
      store,
      stubs: ['router-link', 'v-dialog'],
      mocks: {
        $router: router,
        $route: TestData.mockRoute({
          token: '0xtoken'
        }),
        $raiden: raiden,
        $identicon: $identicon(),
        $t: (msg: string) => msg
      }
    };
    return mount(Transfer, options);
  }

  beforeEach(() => {
    loading.mockReset();
    done.mockReset();
    router.push = jest.fn().mockResolvedValue(null);
  });

  beforeAll(async () => {
    router = new VueRouter() as Mocked<VueRouter>;
    raiden = new RaidenService(store) as Mocked<RaidenService>;
    raiden.fetchTokenData = jest.fn().mockResolvedValue(undefined);
    raiden.getAvailability = jest.fn().mockResolvedValue(true);
    raiden.findRoutes = jest.fn().mockResolvedValue([
      {
        path: ['0xaddr'],
        fee: new BigNumber(1 ** 8)
      }
    ]);

    router.currentRoute = TestData.mockRoute({
      token: '0xtoken'
    });

    store.commit('updateChannels', {
      '0xtoken': {
        '0xaddr': {
          capacity: One,
          balance: Zero,
          ownDeposit: One,
          partnerDeposit: Zero,
          partner: '0xaddr' as any,
          token: '0xtoken' as any,
          state: ChannelState.open,
          settleTimeout: 500,
          tokenNetwork: '0xtokennetwork' as any,
          closeBlock: undefined,
          openBlock: 12346,
          id: 1
        }
      }
    });
    store.commit('updateTokens', { '0xtoken': token });
    store.commit('account', '0x1234567890');

    store.commit('updatePresence', {
      ['0x32bBc8ba52FB6F61C24809FdeDA1baa5E55e55EA']: true
    });

    wrapper = createWrapper(router, raiden);

    await flushPromises();
    loading = jest.spyOn(wrapper.vm.$data, 'loading', 'set');
    done = jest.spyOn(wrapper.vm.$data, 'done', 'set');
  });

  test('populate the data properties when created', async () => {
    expect((wrapper.vm as any).token).toEqual(token);
  });

  test('go to stepper when the target and amount inputs are valid', async () => {
    const addressInput = wrapper.findAll('input').at(0);
    const amountInput = wrapper.findAll('input').at(1);

    mockInput(addressInput, '0x32bBc8ba52FB6F61C24809FdeDA1baa5E55e55EA');
    await wrapper.vm.$nextTick();
    mockInput(amountInput, '0.01');
    await wrapper.vm.$nextTick();
    wrapper.setData({
      valid: true
    });
    await wrapper.vm.$nextTick();

    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();
    wrapper.find('form').trigger('submit');

    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.TRANSFER_STEPS
      })
    );
  });

  test('deposit successfully', async () => {
    raiden.deposit = jest.fn().mockResolvedValue(null);
    // @ts-ignore
    await wrapper.vm.deposit(One);
    await flushPromises();
    jest.advanceTimersByTime(2000);

    expect(loading).toHaveBeenCalledTimes(2);
    expect(loading).toHaveBeenNthCalledWith(1, true);
    expect(loading).toHaveBeenNthCalledWith(2, false);
    expect(done).toBeCalledTimes(2);
    expect(done).toHaveBeenNthCalledWith(1, true);
  });

  test('populates the error property when deposit fails', async () => {
    raiden.deposit = jest.fn().mockRejectedValue(new Error('failure'));
    // @ts-ignore
    await wrapper.vm.deposit(One);
    await flushPromises();
    jest.advanceTimersByTime(2000);

    expect(loading).toHaveBeenCalledTimes(2);
    expect(loading).toHaveBeenNthCalledWith(1, true);
    expect(loading).toHaveBeenNthCalledWith(2, false);
    expect(done).toBeCalledTimes(0);
    expect(wrapper.vm.$data.error).toMatchObject({ message: 'failure' });
  });

  test('navigates to the "ChannelList" when the user presses the channel button', async () => {
    // click on channels button
    wrapper
      .find('.transfer__actions')
      .findAll('.action-button__button')
      .at(0)
      .trigger('click');

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.CHANNELS
      })
    );
  });

  test('show the "TokenOverlay" when the user presses the token networks dropdown', async () => {
    // click on channels button
    wrapper
      .find('.transfer__actions')
      .findAll('.action-button__button')
      .at(1)
      .trigger('click');

    await flushPromises();
    jest.advanceTimersByTime(2000);

    const tokenOverlay = wrapper.find('.v-overlay--active');
    expect(tokenOverlay.exists()).toBe(true);
  });
});
