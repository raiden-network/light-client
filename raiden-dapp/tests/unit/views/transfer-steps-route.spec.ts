/* eslint-disable @typescript-eslint/no-explicit-any */
jest.useFakeTimers();
jest.mock('vue-router');

import { shallowMount, Wrapper } from '@vue/test-utils';
import { BigNumber, constants } from 'ethers';
import Vuetify from 'vuetify';
import Vue from 'vue';
import Vuex from 'vuex';
import VueRouter from 'vue-router';
import flushPromises from 'flush-promises';
import { $t } from '../utils/mocks';
import { generateToken } from '../utils/data-generator';
import { RaidenPaths, RaidenPFS } from 'raiden-ts';
import Mocked = jest.Mocked;

import TransferSteps from '@/views/TransferStepsRoute.vue';
import ActionButton from '@/components/ActionButton.vue';
import { Route } from '@/model/types';
import { RouteNames } from '@/router/route-names';

Vue.use(Vuetify);
Vue.use(Vuex);

const userDepositToken = generateToken({ balance: constants.One });
const transferToken = generateToken({ address: '0x3a989D97388a39A0B5796306C615d10B7416bE77' }); // Must be a checksum address.
const $router = new VueRouter() as Mocked<VueRouter>;
const $route = {
  params: {
    target: '0xtarget',
    token: transferToken.address,
  },
  query: {
    amount: '10',
  },
};

const raidenPFS = {
  price: 100,
  url: 'https://pfs-goerli-with-fee.services-test.raiden.network',
} as RaidenPFS;

const transferRoute = {
  fee: BigNumber.from(100),
  path: [transferToken.address],
} as Route;

const freeTransferRoute = {
  fee: constants.Zero,
  path: [transferToken.address],
} as Route;

const $raiden = {
  getAccount: jest.fn(),
  getMainAccount: jest.fn(),
  fetchAndUpdateTokenData: jest.fn(),
  getUDCCapacity: jest.fn(async () => BigNumber.from('1000000000000000000')),
  findRoutes: jest.fn(async () => [{ path: [transferToken.address], fee: BigNumber.from(100) }]),
  transfer: jest.fn(async () => undefined),
  directRoute: jest.fn(),
};

async function createWrapper(
  step = 1,
  routes: Route[] = [],
  selectedRoute: Route | null = null,
): Promise<Wrapper<TransferSteps>> {
  const vuetify = new Vuetify();

  const state = {
    tokens: { [transferToken.address]: transferToken },
  };

  const getters = {
    mainnet: () => false,
  };

  const userDepositContractModule = {
    namespaced: true,
    state: { token: userDepositToken },
  };

  const store = new Vuex.Store({
    state,
    getters,
    modules: { userDepositContract: userDepositContractModule },
  });

  const wrapper = shallowMount(TransferSteps, {
    store,
    vuetify,
    stubs: { 'action-button': ActionButton },
    mocks: { $router, $route, $t, $raiden },
    data: function () {
      return {
        selectedPfs: raidenPFS,
        step,
        routes,
        selectedRoute,
      };
    },
  });

  await flushPromises(); // Asynchronous 'created' lifecycle hook.
  return wrapper;
}

async function clickTransferButton(wrapper: Wrapper<TransferSteps>): Promise<void> {
  const button = wrapper.find('.transfer__button button');
  expect(button.attributes()['disabled']).toBeUndefined();
  button.trigger('click');
  await flushPromises();
  jest.runOnlyPendingTimers();
}

describe('TransferSteps.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders 3 steps', async () => {
    const wrapper = await createWrapper();

    expect(wrapper.findAll('.transfer-steps__step').length).toBe(3);
  });

  test('enables the continue button and allows the user to proceed', async () => {
    const wrapper = await createWrapper();

    await clickTransferButton(wrapper);

    expect(wrapper.vm.$data.step).toBe(2);
  });

  test('show an error when the paths fail to fetch', async () => {
    const wrapper = await createWrapper();
    (wrapper.vm as any).$raiden.findRoutes.mockRejectedValue(new Error('failed'));

    await clickTransferButton(wrapper);

    expect(wrapper.vm.$data.step).toBe(2);
    expect(wrapper.vm.$data.error).toMatchObject({ message: 'failed' });
  });

  test('enables the continue button and lets the user to proceed to the 3rd step', async () => {
    const wrapper = await createWrapper(2, [transferRoute], transferRoute);

    await clickTransferButton(wrapper);

    expect(wrapper.vm.$data.step).toBe(3);
  });

  test('enables the final confirmation button and allows the token transfer', async () => {
    const wrapper = await createWrapper(3, undefined, transferRoute);
    const processingTransferSpy = jest.spyOn(wrapper.vm.$data, 'processingTransfer', 'set');
    const transferDoneSpy = jest.spyOn(wrapper.vm.$data, 'transferDone', 'set');

    await clickTransferButton(wrapper);

    expect((wrapper.vm as any).$raiden.transfer).toHaveBeenCalledTimes(1);

    expect(processingTransferSpy).toHaveBeenCalledTimes(2);
    expect(processingTransferSpy).toHaveBeenNthCalledWith(1, true);
    expect(processingTransferSpy).toHaveBeenNthCalledWith(2, false);

    expect(transferDoneSpy).toBeCalledTimes(2);
    expect(transferDoneSpy).toHaveBeenNthCalledWith(1, true);
    expect(transferDoneSpy).toHaveBeenNthCalledWith(2, false);

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.TRANSFER,
      }),
    );
  });

  test('show an error when the token transfer fails', async () => {
    const wrapper = await createWrapper(3, [transferRoute], transferRoute);
    (wrapper.vm as any).$raiden.transfer.mockRejectedValue(new Error('failure'));
    const processingTransferSpy = jest.spyOn(wrapper.vm.$data, 'processingTransfer', 'set');
    const transferDoneSpy = jest.spyOn(wrapper.vm.$data, 'transferDone', 'set');

    await clickTransferButton(wrapper);

    expect((wrapper.vm as any).$raiden.transfer).toHaveBeenCalledTimes(1);

    expect(processingTransferSpy).toHaveBeenCalledTimes(1);
    expect(processingTransferSpy).toHaveBeenNthCalledWith(1, true);

    expect(transferDoneSpy).toBeCalledTimes(0);
    expect(wrapper.vm.$data.error).toBeInstanceOf(Error);
  });

  test('skip to transfer summary, if a direct route is available', async () => {
    // Mock needs to be available during creation of wrapper.
    $raiden.directRoute.mockResolvedValue([freeTransferRoute] as RaidenPaths);
    const wrapper = await createWrapper();

    expect(wrapper.vm.$data.step).toBe(3);
    expect((wrapper.vm as any).$raiden.transfer).toHaveBeenCalledTimes(0);
    $raiden.directRoute = jest.fn();
  });

  test('skip to transfer summary, if a free route is available', async () => {
    const wrapper = await createWrapper();
    (wrapper.vm as any).$raiden.findRoutes.mockResolvedValue([freeTransferRoute]);

    await clickTransferButton(wrapper);

    expect(wrapper.vm.$data.step).toBe(3);
    expect((wrapper.vm as any).$raiden.transfer).toHaveBeenCalledTimes(0);
  });

  test('skip pfs selection if free pfs is found', async () => {
    const wrapper = await createWrapper();
    (wrapper.vm as any).$raiden.findRoutes.mockResolvedValue([freeTransferRoute]);

    (wrapper.vm as any).setPFS([{ ...raidenPFS, price: constants.Zero } as RaidenPFS, true]);
    await flushPromises();
    jest.advanceTimersByTime(2000);

    expect(wrapper.vm.$data.step).toBe(3);
    expect((wrapper.vm as any).$raiden.transfer).toHaveBeenCalledTimes(0);
  });
});
