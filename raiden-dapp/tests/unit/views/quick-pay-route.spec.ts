import { $t } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { createLocalVue, shallowMount } from '@vue/test-utils';
import { constants } from 'ethers';
import flushPromises from 'flush-promises';
import Vuex, { Store } from 'vuex';

import type { Address, RaidenChannel } from 'raiden-ts';

import ChannelDepositAndTransferAction from '@/components/channels/ChannelDepositAndTransferAction.vue';
import ChannelOpenAndTransferAction from '@/components/channels/ChannelOpenAndTransferAction.vue';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';
import DirectTransferAction from '@/components/transfer/DirectTransferAction.vue';
import MediatedTransferAction from '@/components/transfer/MediatedTransferAction.vue';
import type { Token } from '@/model/types';
import { RouteNames } from '@/router/route-names';
import QuickPayRoute from '@/views/QuickPayRoute.vue';

import { generateChannel, generateRoute, generateToken } from '../utils/data-generator';

const localVue = createLocalVue();
localVue.use(Vuex);

const userDepositToken = generateToken({ balance: constants.One });

function createWrapper(options?: {
  tokenAddress?: string;
  targetAddress?: string;
  tokenAmount?: string;
  paymentIdentifier?: string;
  redirectTo?: string;
  token?: Token;
  channels?: RaidenChannel[];
  accountAddress?: string;
  getUDCCapacity?: () => void;
  fetchServices?: () => void;
  findRoutes?: () => void;
  disconnect?: () => void;
  push?: () => void;
}): Wrapper<QuickPayRoute> {
  const token = options?.token ?? generateToken();

  const getters = {
    channels: () => () => options?.channels ?? [],
    token: () => () => token,
  };

  const userDepositContractModule = {
    namespaced: true,
    state: { token: userDepositToken },
  };

  const store = new Store({
    getters,
    modules: { userDepositContract: userDepositContractModule },
  });

  const $raiden = {
    getAccount: () => options?.accountAddress,
    disconnect: options?.disconnect ?? jest.fn(),
    getUDCCapacity: options?.getUDCCapacity ?? jest.fn().mockResolvedValue(constants.Two),
    fetchServices:
      options?.fetchServices ?? jest.fn().mockResolvedValue([{ price: constants.One }]),
    findRoutes: options?.findRoutes ?? jest.fn().mockResolvedValue(['no-actual-route']),
  };

  const $route = generateRoute({
    query: {
      tokenAddress: options?.tokenAddress ?? '0x59105441977ecD9d805A4f5b060E34676F50F806',
      targetAddress: options?.targetAddress ?? '0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf',
      amount: options?.tokenAmount ?? '1',
      identifier: options?.paymentIdentifier ?? '2',
      redirectTo: options?.redirectTo ?? '',
    },
  });

  const $router = {
    push: options?.push ?? jest.fn(),
  };

  return shallowMount(QuickPayRoute, {
    localVue,
    store,
    mocks: { $raiden, $route, $router, $t },
    stubs: ['i18n'],
  });
}

async function clickGetRoutesButton(wrapper: Wrapper<QuickPayRoute>): Promise<void> {
  const getRouteButton = wrapper.get('.quick-pay__transfer-information__mediation__button');
  await flushPromises(); // Fetching services must complete
  getRouteButton.trigger('click');
  await flushPromises(); // Fetching routes must complete
}

const partnerAddress = '0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf';
const foreignAddress = '0xdA75b5Cd196C6C8292B567Fdc78B33A886ce0d80';

const channelWithPartner = generateChannel({
  partner: partnerAddress as Address,
  capacity: constants.One,
});

const optionsForDirectTransfer = {
  targetAddress: partnerAddress,
  tokenAmount: '1',
  channels: [channelWithPartner],
};

const optionsForMediatedTransfer = {
  targetAddress: foreignAddress,
  tokenAmount: '1',
  channels: [channelWithPartner],
};

const optionsForChannelDepositAndTransfer = {
  targetAddress: partnerAddress,
  tokenAmount: '5',
  channels: [channelWithPartner],
};

const optionsForChannelOpenAndTransfer = {
  targetAddress: foreignAddress,
  tokenAmount: '1',
  channels: [],
};

describe('QuickPayRoute.vue', () => {
  afterEach(() => {
    flushPromises();
  });

  describe('transfer information', () => {
    test('displays header', () => {
      const wrapper = createWrapper();
      const header = wrapper.find('.quick-pay__transfer-information__header');

      expect(header.exists()).toBeTruthy();
      expect(header.text()).toContain('quick-pay.transfer-information.header');
    });

    test('displays token information', () => {
      const token = generateToken();
      const wrapper = createWrapper({ token });
      const tokenInformation = wrapper.find('.quick-pay__transfer-information__token');

      expect(tokenInformation.exists()).toBeTruthy();
      expect(tokenInformation.html()).toContain(token.toString());
    });

    test('displays target address', () => {
      const wrapper = createWrapper({
        targetAddress: '0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf',
      });
      const addressDisplay = wrapper.find('.quick-pay__transfer-information__target');

      expect(addressDisplay.exists()).toBeTruthy();
      expect(addressDisplay.html()).toContain('0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf');
      expect(addressDisplay.html()).toContain('quick-pay.transfer-information.target-address');
    });

    test('displays token amount', () => {
      const token = generateToken();
      const wrapper = createWrapper({ tokenAmount: '1', token });
      const amountDisplay = wrapper.find('.quick-pay__transfer-information__amount');

      expect(amountDisplay.exists()).toBeTruthy();
      expect(amountDisplay.html()).toContain('1');
      expect(amountDisplay.html()).toContain(token.toString());
      expect(amountDisplay.html()).toContain('quick-pay.transfer-information.token-amount');
    });
  });

  describe('invalid query parameters', () => {
    test('token address must be defined', () => {
      const wrapper = createWrapper({ tokenAddress: '' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('token address must be in cheksum format', () => {
      const wrapper = createWrapper({
        tokenAddress: '0x59105441977ecd9d805a4f5b060e34676f50f806',
      });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('target address must be defined', () => {
      const wrapper = createWrapper({ targetAddress: '' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('target address must be in cheksum format', () => {
      const wrapper = createWrapper({
        targetAddress: '0x1f916ab5cf1b30b22f24ebf435f53ee665344acf',
      });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('token amount must be defined', () => {
      const wrapper = createWrapper({ tokenAmount: '' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('token amount must be bignumberish', () => {
      const wrapper = createWrapper({ tokenAmount: 'one' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('payment identifier must be defined', () => {
      const wrapper = createWrapper({ paymentIdentifier: '' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('payment identifier must be bignumberish', () => {
      const wrapper = createWrapper({ paymentIdentifier: 'one' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });
  });

  describe('direct transfer', () => {
    test('displays direct transfer action if direct channel exists and has enough capacity', () => {
      const wrapper = createWrapper(optionsForDirectTransfer);
      const action = wrapper.findComponent(DirectTransferAction);

      expect(action.exists()).toBeTruthy();
    });

    test('displays no action header', () => {
      const wrapper = createWrapper(optionsForDirectTransfer);
      const header = wrapper.find('.quick-pay__action__header');

      expect(header.exists()).toBeFalsy();
    });

    test('displays correct action message', () => {
      const wrapper = createWrapper(optionsForDirectTransfer);
      const message = wrapper.find('.quick-pay__action__message');

      expect(message.exists()).toBeTruthy();
      expect(message.html()).toContain('quick-pay.action-messages.direct-transfer');
    });
  });

  describe('mediated transfer', () => {
    test('displays medidation information if any channel has enough capacity but not the direct one', () => {
      const wrapper = createWrapper(optionsForMediatedTransfer);
      const mediationInformation = wrapper.find('.quick-pay__transfer-information__mediation');

      expect(mediationInformation.exists()).toBeTruthy();
    });

    test('initially fetches user deposit capacity', () => {
      const getUDCCapacity = jest.fn();
      createWrapper({ getUDCCapacity });

      expect(getUDCCapacity).toHaveBeenCalledTimes(1);
    });

    test('initially fetches pathfinding service', () => {
      const fetchServices = jest.fn().mockResolvedValue(['no-pathfinding-serivce']);
      createWrapper({ fetchServices });

      expect(fetchServices).toHaveBeenCalledTimes(1);
    });

    test('shows spinner while pathfinding service is fetched', async () => {
      const fetchServices = jest.fn(() => new Promise(() => undefined));
      const wrapper = createWrapper({ fetchServices, ...optionsForMediatedTransfer });
      const spinner = wrapper.findComponent(Spinner);

      expect(spinner.exists()).toBeTruthy();
    });

    test('disables get route button while pathfinding service is fetched', async () => {
      const fetchServices = jest.fn(() => new Promise(() => undefined));
      const wrapper = createWrapper({ fetchServices, ...optionsForMediatedTransfer });
      const getRouteButton = wrapper.get('.quick-pay__transfer-information__mediation__button');

      expect(getRouteButton.attributes('disabled')).toBeTruthy();
    });

    test('selects the first returned pathfinding service as cheapest', async () => {
      const fetchServices = jest
        .fn()
        .mockResolvedValue([{ price: constants.One }, { price: constants.Two }]);
      const wrapper = createWrapper({ fetchServices, ...optionsForMediatedTransfer });
      const pathfindingServicePrice = wrapper.find(
        '.quick-pay__transfer-information__mediation__pathfinding-service-price',
      );

      await flushPromises(); // Fetch services must complete.

      expect(pathfindingServicePrice.exists()).toBeTruthy();
      expect(pathfindingServicePrice.html()).toContain('1');
    });

    test('marks pathfinding service price with a warning when price is higher than user deposit capacity', async () => {
      const getUDCCapacity = jest.fn().mockResolvedValue(constants.One);
      const fetchServices = jest.fn().mockResolvedValue([{ price: constants.Two }]);
      const wrapper = createWrapper({
        getUDCCapacity,
        fetchServices,
        ...optionsForMediatedTransfer,
      });
      const pathfindingServicePrice = wrapper.find(
        '.quick-pay__transfer-information__mediation__pathfinding-service-price',
      );

      await flushPromises(); // Fetch services must complete.

      expect(pathfindingServicePrice.html()).toContain('warning');
    });

    test('disables get route button when pathfinding service price is higher than user deposit capacity', () => {
      const getUDCCapacity = jest.fn().mockResolvedValue(constants.One);
      const fetchServices = jest.fn().mockResolvedValue([{ price: constants.Two }]);
      const wrapper = createWrapper({
        getUDCCapacity,
        fetchServices,
        ...optionsForMediatedTransfer,
      });
      const getRouteButton = wrapper.get('.quick-pay__transfer-information__mediation__button');

      expect(getRouteButton.attributes('disabled')).toBeTruthy();
    });

    test('fetches routes from cheapest pathfinding service when user click button', async () => {
      const fetchServices = jest.fn().mockResolvedValue(['no-actual-service']);
      const findRoutes = jest.fn();
      const wrapper = createWrapper({
        ...optionsForMediatedTransfer,
        tokenAddress: '0x59105441977ecD9d805A4f5b060E34676F50F806',
        targetAddress: '0xdA75b5Cd196C6C8292B567Fdc78B33A886ce0d80',
        tokenAmount: '1',
        fetchServices,
        findRoutes,
      });

      await clickGetRoutesButton(wrapper);

      expect(findRoutes).toHaveBeenCalledTimes(1);
      expect(findRoutes).toHaveBeenLastCalledWith(
        '0x59105441977ecD9d805A4f5b060E34676F50F806',
        '0xdA75b5Cd196C6C8292B567Fdc78B33A886ce0d80',
        constants.One,
        'no-actual-service',
      );
    });

    test('shows warning message if no route was found', async () => {
      const findRoutes = jest.fn().mockRejectedValue(new Error('No route between nodes'));
      const wrapper = createWrapper({ findRoutes, ...optionsForMediatedTransfer });

      await clickGetRoutesButton(wrapper);

      const mediationError = wrapper.find('.quick-pay__transfer-information__mediation__error');
      expect(mediationError.exists()).toBeTruthy();
      expect(mediationError.text()).toBe('quick-pay.transfer-information.fetch-route-error');
    });

    test('selects the first returned route as cheapest', async () => {
      const findRoutes = jest
        .fn()
        .mockResolvedValue([{ fee: constants.One }, { fee: constants.Two }]);
      const wrapper = createWrapper({ findRoutes, ...optionsForMediatedTransfer });

      await clickGetRoutesButton(wrapper);

      const mediationFees = wrapper.find('.quick-pay__transfer-information__mediation__fees');
      expect(mediationFees.exists()).toBeTruthy();
      expect(mediationFees.html()).toContain('1');
    });

    test('displays mediated transfer action when a route has been found', async () => {
      const findRoutes = jest.fn().mockResolvedValue(['no-actual-route']);
      const wrapper = createWrapper({ findRoutes, ...optionsForMediatedTransfer });

      await clickGetRoutesButton(wrapper);

      const action = wrapper.findComponent(MediatedTransferAction);
      expect(action.exists()).toBeTruthy();
    });

    test('displays no action header', async () => {
      const findRoutes = jest.fn().mockResolvedValue(['no-actual-route']);
      const wrapper = createWrapper({ findRoutes, ...optionsForMediatedTransfer });

      await clickGetRoutesButton(wrapper);

      const header = wrapper.find('.quick-pay__action__header');
      expect(header.exists()).toBeFalsy();
    });

    test('displays correct action message', async () => {
      const findRoutes = jest.fn().mockResolvedValue(['no-actual-route']);
      const wrapper = createWrapper({ findRoutes, ...optionsForMediatedTransfer });

      await clickGetRoutesButton(wrapper);

      const message = wrapper.find('.quick-pay__action__message');
      expect(message.exists()).toBeTruthy();
      expect(message.html()).toContain('quick-pay.action-messages.mediated-transfer');
    });
  });

  describe('channel deposit and transfer', () => {
    test('displays channel deposit and transfer action if no channel has enough capacity but there is a direct one', () => {
      const wrapper = createWrapper(optionsForChannelDepositAndTransfer);
      const action = wrapper.findComponent(ChannelDepositAndTransferAction);

      expect(action.exists()).toBeTruthy();
    });

    test('displays correct action header', () => {
      const wrapper = createWrapper(optionsForChannelDepositAndTransfer);
      const header = wrapper.find('.quick-pay__action__header');

      expect(header.exists()).toBeTruthy();
      expect(header.text()).toBe('quick-pay.action-titles.channel-deposit');
    });

    test('displays correct action message', () => {
      const wrapper = createWrapper(optionsForChannelDepositAndTransfer);
      const message = wrapper.find('.quick-pay__action__message');

      expect(message.exists()).toBeTruthy();
      expect(message.html()).toContain('quick-pay.action-messages.channel-deposit-and-transfer');
    });
  });

  describe('channel open and transfer', () => {
    test('displays channel open and transfer action if no channel has enough capacity and there is no direct one', () => {
      const wrapper = createWrapper(optionsForChannelOpenAndTransfer);
      const action = wrapper.findComponent(ChannelOpenAndTransferAction);

      expect(action.exists()).toBeTruthy();
    });

    test('displays correct action header', () => {
      const wrapper = createWrapper(optionsForChannelOpenAndTransfer);
      const header = wrapper.find('.quick-pay__action__header');

      expect(header.exists()).toBeTruthy();
      expect(header.text()).toBe('quick-pay.action-titles.channel-open');
    });

    test('displays correct action message', () => {
      const wrapper = createWrapper(optionsForChannelOpenAndTransfer);
      const message = wrapper.find('.quick-pay__action__message');

      expect(message.exists()).toBeTruthy();
      expect(message.html()).toContain('quick-pay.action-messages.channel-open-and-transfer');
    });
  });

  describe('redirections after action has finished', () => {
    const originalWindowLocation = global.window.location;
    let windowReplaceSpy: jest.Mock;

    beforeAll(() => {
      windowReplaceSpy = jest.fn();
      Reflect.deleteProperty(global.window, 'location');
      global.window.location = {
        ...originalWindowLocation,
        replace: windowReplaceSpy,
      };
    });

    beforeEach(() => {
      jest.resetAllMocks();
    });

    afterAll(() => {
      global.window.location = originalWindowLocation;
    });

    test('includes payment information parameters to specified target on completed action', async () => {
      const wrapper = createWrapper({
        redirectTo: 'https://redirect.target',
        paymentIdentifier: '501',
        accountAddress: '0x3D389c9B67cA85F1de2EbeF648C54d740365c366',
      });
      const action = wrapper.get('.quick-pay__action__component');

      action.vm.$emit('completed');
      await wrapper.vm.$nextTick();

      expect(windowReplaceSpy).toHaveBeenCalledTimes(1);
      expect(windowReplaceSpy).toHaveBeenLastCalledWith(
        'https://redirect.target?identifier=501&payerAddress=0x3D389c9B67cA85F1de2EbeF648C54d740365c366',
      );
    });

    test('shuts down raiden before redirect', async () => {
      const disconnect = jest.fn();
      const wrapper = createWrapper({ disconnect, redirectTo: 'https://redirect.target' });
      const action = wrapper.get('.quick-pay__action__component');

      action.vm.$emit('completed');
      await wrapper.vm.$nextTick();

      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    test('redirects to transfer screen of given token if no redirect target given', async () => {
      const push = jest.fn();
      const wrapper = createWrapper({
        push,
        redirectTo: '',
        tokenAddress: '0x59105441977ecD9d805A4f5b060E34676F50F806',
      });
      const action = wrapper.get('.quick-pay__action__component');

      action.vm.$emit('completed');
      await wrapper.vm.$nextTick();

      expect(push).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenLastCalledWith({
        name: RouteNames.TRANSFER,
        params: { token: '0x59105441977ecD9d805A4f5b060E34676F50F806' },
      });
    });

    test('includes failed state if there is an error and the user dismisses the dialog', async () => {
      const wrapper = createWrapper({
        redirectTo: 'https://redirect.target',
        paymentIdentifier: '501',
      });
      const action = wrapper.get('.quick-pay__action__component');

      action.vm.$emit('failed', new Error());
      action.vm.$emit('dialogClosed');
      await wrapper.vm.$nextTick();

      expect(windowReplaceSpy).toHaveBeenCalledTimes(1);
      expect(windowReplaceSpy).toHaveBeenLastCalledWith(
        'https://redirect.target?identifier=501&failed=true',
      );
    });
  });
});
