jest.useFakeTimers();

import { mount } from '@vue/test-utils';
import { bigNumberify } from 'ethers/utils';
import { Zero } from 'ethers/constants';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { RaidenPFS } from 'raiden-ts';
import flushPromises from 'flush-promises';
import Mocked = jest.Mocked;
import VueRouter from 'vue-router';

import TransferSteps from '@/views/TransferSteps.vue';
import { Route } from '@/model/types';
import store from '@/store/index';
import { Tokens } from '@/types';
import { Token } from '@/model/types';
import { RouteNames } from '@/router/route-names';

Vue.use(Vuetify);

describe('TransferSteps.vue', () => {
  let vuetify: typeof Vuetify;
  let processingTransfer: jest.SpyInstance;
  let transferDone: jest.SpyInstance;
  let $raiden = { transfer: jest.fn() };
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

  function createWrapper(data: any) {
    vuetify = new Vuetify();
    return mount(TransferSteps, {
      store,
      vuetify,
      sync: false,
      mocks: {
        $router: router,
        $route: {
          params: {
            target: '0xtarget',
            amount: '100000',
            token: '0x3a989D97388a39A0B5796306C615d10B7416bE77'
          }
        },
        $t: (msg: string) => msg,
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
        balance: Zero
      } as Token
    } as Tokens);
  });

  beforeEach(() => {
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockResolvedValue(null);
  });

  test('should render 3 steps', async () => {
    const wrapper = createWrapper({});
    expect(wrapper.findAll('.transfer-steps__step').length).toBe(3);
  });

  test('should enable continue button and let user proceed to 2nd step', async () => {
    const wrapper = createWrapper({
      step: 1,
      selectedPfs: raidenPFS
    });

    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();
    button.trigger('click');
    expect(wrapper.vm.$data.step).toBe(2);
  });

  test('should enable continue button and let user proceed to 3rd step', async () => {
    const wrapper = createWrapper({
      step: 2,
      selectedPfs: raidenPFS,
      selectedRoute: route
    });

    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();
    button.trigger('click');
    expect(wrapper.vm.$data.step).toBe(3);
  });

  test('should enable final confirmation button and allow token transfer', async () => {
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
    const totalAmount = wrapper.find('.transfer-steps__total-amount h2');
    expect(totalAmount.text()).toContain(
      'transfer.steps.confirm-transfer.token-amount'
    );

    // Confirmation btn is enabled
    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();

    // Token transfer
    button.trigger('click');
    await flushPromises();
    jest.advanceTimersByTime(5000);

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

  test('should show error if token transfer failed', async () => {
    $raiden.transfer = jest.fn().mockRejectedValue(new Error('failure'));

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
    const totalAmount = wrapper.find('.transfer-steps__total-amount h2');
    expect(totalAmount.text()).toContain(
      'transfer.steps.confirm-transfer.token-amount'
    );

    // Confirmation btn is enabled
    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();

    // Token transfer
    button.trigger('click');
    await flushPromises();
    jest.advanceTimersByTime(2000);

    expect($raiden.transfer).toHaveBeenCalledTimes(1);
    expect(processingTransfer).toHaveBeenCalledTimes(2);
    expect(processingTransfer).toHaveBeenNthCalledWith(1, true);
    expect(processingTransfer).toHaveBeenNthCalledWith(2, false);
    expect(transferDone).toBeCalledTimes(0);
    expect(wrapper.vm.$data.error).toEqual('failure');
  });
});
