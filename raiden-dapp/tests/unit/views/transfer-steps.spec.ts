import { addElemWithDataAppToBody } from '../utils/dialog';

jest.useFakeTimers();

import { mount } from '@vue/test-utils';
import { bigNumberify } from 'ethers/utils';
import { One, Zero } from 'ethers/constants';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { RaidenPaths, RaidenPFS } from 'raiden-ts';
import flushPromises from 'flush-promises';
import Mocked = jest.Mocked;
import VueRouter from 'vue-router';

import TransferSteps from '@/views/TransferSteps.vue';
import { Route, Token } from '@/model/types';
import store from '@/store/index';
import { Tokens } from '@/types';

import { RouteNames } from '@/router/route-names';

Vue.use(Vuetify);

describe('TransferSteps.vue', () => {
  addElemWithDataAppToBody();
  let vuetify: typeof Vuetify;
  let processingTransfer: jest.SpyInstance;
  let transferDone: jest.SpyInstance;
  let router: Mocked<VueRouter>;

  const raidenPFS: RaidenPFS = {
    address: '0x94DEe8e391410A9ebbA791B187df2d993212c849',
    price: 100,
    rtt: 62,
    token: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    url: 'https://pfs-goerli-with-fee.services-test.raiden.network'
  };

  const route = {
    displayFee: '0.0000000000000001',
    fee: bigNumberify(100),
    hops: 0,
    key: 0,
    path: ['0x3a989D97388a39A0B5796306C615d10B7416bE77']
  } as Route;

  const freeRoute = {
    path: ['0x3a989D97388a39A0B5796306C615d10B7416bE77'],
    fee: Zero
  } as Route;

  let $raiden = {
    transfer: jest.fn(),
    fetchTokenData: jest.fn().mockResolvedValue(undefined),
    fetchServices: jest.fn().mockResolvedValue([raidenPFS]),
    getUDCCapacity: jest
      .fn()
      .mockResolvedValue(bigNumberify('1000000000000000000')),
    userDepositTokenAddress: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    directRoute: jest.fn().mockResolvedValue(undefined),
    findRoutes: jest.fn().mockResolvedValue([
      {
        path: ['0x3a989D97388a39A0B5796306C615d10B7416bE77'],
        fee: bigNumberify(100)
      }
    ])
  };

  function createWrapper(data: any) {
    vuetify = new Vuetify();
    return mount(TransferSteps, {
      store,
      vuetify,
      mocks: {
        $router: router,
        $route: {
          params: {
            target: '0xtarget',
            token: '0x3a989D97388a39A0B5796306C615d10B7416bE77'
          },
          query: {
            amount: '100000'
          }
        },
        $t: (msg: string, args: object) =>
          `${msg} args: ${JSON.stringify(args)}`,
        $raiden
      },
      data: function() {
        return {
          ...data
        };
      }
    });
  }

  beforeAll(() => {
    store.commit('updateTokens', {
      '0x3a989D97388a39A0B5796306C615d10B7416bE77': {
        address: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
        name: 'ServiceToken',
        symbol: 'SVT',
        decimals: 18,
        balance: One
      } as Token
    } as Tokens);
  });

  beforeEach(() => {
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockResolvedValue(null);
    $raiden.transfer.mockClear();
  });

  test('renders 3 steps', async () => {
    expect.assertions(1);
    const wrapper = createWrapper({});
    expect(wrapper.findAll('.transfer-steps__step').length).toBe(3);
  });

  test('enables the continue button and allows the user to proceed', async () => {
    expect.assertions(2);
    const wrapper = createWrapper({
      step: 1,
      selectedPfs: raidenPFS
    });
    await flushPromises();
    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();
    button.trigger('click');
    await flushPromises();
    jest.runOnlyPendingTimers();
    expect(wrapper.vm.$data.step).toBe(2);
  });

  test('show an error when the paths fail to fetch', async () => {
    expect.assertions(3);
    const wrapper = createWrapper({
      step: 1,
      selectedPfs: raidenPFS
    });
    $raiden.findRoutes.mockRejectedValueOnce(new Error('failed'));
    await flushPromises();
    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();
    button.trigger('click');
    await flushPromises();
    jest.runOnlyPendingTimers();
    expect(wrapper.vm.$data.step).toBe(1);
    expect(wrapper.vm.$data.error).toEqual('failed');
  });

  test('enables the continue button and lets the user to proceed to the 3rd step', async () => {
    expect.assertions(2);
    const wrapper = createWrapper({
      step: 2,
      selectedPfs: raidenPFS,
      routes: [route],
      selectedRoute: route
    });

    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();
    button.trigger('click');
    expect(wrapper.vm.$data.step).toBe(3);
  });

  test('enables the final confirmation button and allows the token transfer', async () => {
    $raiden.transfer.mockResolvedValue(null);
    const wrapper = createWrapper({
      step: 3,
      selectedPfs: raidenPFS,
      selectedRoute: route,
      processingTransfer: false
    });

    processingTransfer = jest.spyOn(
      wrapper.vm.$data,
      'processingTransfer',
      'set'
    );
    transferDone = jest.spyOn(wrapper.vm.$data, 'transferDone', 'set');

    // Displays total amount
    const totalAmount = wrapper.find('.transfer-summary__transfer-total');
    expect(totalAmount.text()).toMatch(/≈100000.000000.*\n.*SVT/);

    // Confirmation btn is enabled
    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();

    // Token transfer
    button.trigger('click');
    await flushPromises();
    jest.advanceTimersByTime(7000);

    expect($raiden.transfer).toHaveBeenCalledTimes(1);
    expect(processingTransfer).toHaveBeenCalledTimes(2);
    expect(processingTransfer).toHaveBeenNthCalledWith(1, true);
    expect(processingTransfer).toHaveBeenNthCalledWith(2, false);
    expect(transferDone).toBeCalledTimes(2);
    expect(transferDone).toHaveBeenNthCalledWith(1, true);
    expect(transferDone).toHaveBeenNthCalledWith(2, false);

    // Redirected to transfer screen after successful transfer
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.TRANSFER
      })
    );
  });

  test('show an error when the token transfer fails', async () => {
    $raiden.transfer.mockRejectedValueOnce(new Error('failure'));

    const wrapper = createWrapper({
      step: 3,
      selectedPfs: raidenPFS,
      selectedRoute: route,
      route: [route],
      processingTransfer: false
    });

    processingTransfer = jest.spyOn(
      wrapper.vm.$data,
      'processingTransfer',
      'set'
    );
    transferDone = jest.spyOn(wrapper.vm.$data, 'transferDone', 'set');

    // Displays total amount
    const totalAmount = wrapper.find('.transfer-summary__transfer-total');
    expect(totalAmount.text()).toMatch(/≈100000.000000.*\n.*SVT/);

    // Confirmation btn is enabled
    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();

    // Token transfer
    button.trigger('click');
    await flushPromises();
    jest.advanceTimersByTime(2000);

    expect($raiden.transfer).toHaveBeenCalledTimes(1);
    expect(processingTransfer).toHaveBeenCalledTimes(1);
    expect(processingTransfer).toHaveBeenNthCalledWith(1, true);
    expect(transferDone).toBeCalledTimes(0);
    expect(wrapper.vm.$data.error).toEqual('failure');
  });

  test('skip to transfer summary, if a direct route is available', async () => {
    expect.assertions(2);
    $raiden.directRoute.mockResolvedValueOnce([freeRoute] as RaidenPaths);
    $raiden.transfer.mockResolvedValueOnce(undefined);
    const wrapper = createWrapper({});
    await flushPromises();
    expect(wrapper.vm.$data.step).toBe(3);
    expect($raiden.transfer).toHaveBeenCalledTimes(0);
  });

  test('skip to transfer summary, if a free route is available', async () => {
    expect.assertions(2);
    $raiden.findRoutes.mockResolvedValue([freeRoute]);
    $raiden.transfer.mockResolvedValueOnce(undefined);

    const wrapper = createWrapper({
      step: 1,
      selectedPfs: raidenPFS,
      processingTransfer: false
    });

    await flushPromises();
    wrapper.find('.action-button__button').trigger('click');

    await flushPromises();
    jest.advanceTimersByTime(3000);

    expect(wrapper.vm.$data.step).toBe(3);
    expect($raiden.transfer).toHaveBeenCalledTimes(0);
  });

  test('skip pfs selection if free pfs is found', async () => {
    $raiden.findRoutes.mockResolvedValue([freeRoute]);
    const wrapper = createWrapper({
      step: 1,
      processingTransfer: false
    });

    // @ts-ignore
    wrapper.vm.setPFS([{ ...raidenPFS, price: Zero } as RaidenPFS, true]);
    await flushPromises();
    jest.advanceTimersByTime(2000);
    expect(wrapper.vm.$data.step).toBe(3);
    expect($raiden.transfer).toHaveBeenCalledTimes(0);
  });
});
