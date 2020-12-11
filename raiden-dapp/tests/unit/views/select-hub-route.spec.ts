import { BigNumber } from 'ethers';

jest.useFakeTimers();
jest.mock('vue-router');

import { mount, shallowMount, Wrapper } from '@vue/test-utils';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import Vue from 'vue';
import VueRouter from 'vue-router';
import flushPromises from 'flush-promises';
import { TestData } from '../data/mock-data';
import { mockInput } from '../utils/interaction-utils';
import { $identicon } from '../utils/mocks';
import { generateToken } from '../utils/data-generator';
import SelectHubRoute from '@/views/SelectHubRoute.vue';
import Mocked = jest.Mocked;
import { RouteNames } from '@/router/route-names';
import Filters from '@/filters';

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.filter('truncate', Filters.truncate);

const userDepositToken = generateToken();
const transferToken = generateToken({ address: '0x3a989D97388a39A0B5796306C615d10B7416bE77' }); // Checksum address required.
const $router = new VueRouter() as Mocked<VueRouter>;
const transferTokenRoute = TestData.mockRoute({ token: transferToken.address });

async function createWrapper(
  $route = transferTokenRoute,
  monitoringReward = BigNumber.from('1'),
  udcCapacity = BigNumber.from('2'),
  networkName = 'mainnet',
  shallow = false,
): Promise<Wrapper<SelectHubRoute>> {
  const vuetify = new Vuetify();

  const state = {
    defaultAccount: '0xAccount',
    channels: { [transferToken.address]: {} },
    network: { name: networkName },
    tokens: {
      [transferToken.address]: transferToken,
    },
    presences: {
      ['0x1D36124C90f53d491b6832F1c073F43E2550E35b']: true,
    },
  };

  const getters = {
    mainnet: () => false,
    token: () => (address: string) =>
      address === transferToken.address ? transferToken : undefined,
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

  const options = {
    vuetify,
    store,
    stubs: ['v-dialog'],
    mocks: {
      $route,
      $router,
      $identicon: $identicon(),
      $raiden: {
        fetchAndUpdateTokenData: jest.fn().mockResolvedValue(null),
        getAvailability: jest.fn().mockResolvedValue(true),
        monitoringReward,
        monitorToken: jest.fn(),
        getUDCCapacity: jest.fn(async () => udcCapacity),
        getMainAccount: jest.fn(),
        getAccount: jest.fn(),
      },
      $t: (msg: string) => msg,
    },
  };

  const wrapper = shallow ? shallowMount(SelectHubRoute, options) : mount(SelectHubRoute, options);
  await wrapper.vm.$nextTick();
  await flushPromises();
  return wrapper;
}

describe('SelectHubRoute.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(() => {
    process.env = { VUE_APP_HUB: 'hub.raiden.network' };
  });

  test('navigate to "OpenChannel when the user selects a hub', async () => {
    const wrapper = await createWrapper();

    mockInput(wrapper, '0x1D36124C90f53d491b6832F1c073F43E2550E35b');
    jest.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();
    await flushPromises();
    wrapper.find('form').trigger('submit');

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: RouteNames.OPEN_CHANNEL }),
    );
  });

  test('disable button if UDC capacity is not sufficient', async () => {
    const wrapper = await createWrapper(undefined, BigNumber.from('2'), BigNumber.from('1'));

    expect(wrapper.find('.action-button__button').element.getAttribute('disabled')).toBe(
      'disabled',
    );
  });

  test('navigate to "Home" when the token address is not in checksum format', async () => {
    const route = TestData.mockRoute({ token: '0xNoChecksumAddress' });
    await createWrapper(route, undefined, undefined, undefined, true);

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.HOME,
      }),
    );
  });

  test('navigate to "Home" when the token cannot be found', async () => {
    const route = TestData.mockRoute({ token: '0xcB91d6549c3c88B36d52E43C019713E2053B4fEf' });
    await createWrapper(route, undefined, undefined, undefined, true);

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.HOME,
      }),
    );
  });

  test('auto suggest our hub on goerli if not connected yet', async () => {
    const wrapper = await createWrapper(undefined, undefined, undefined, 'goerli');

    jest.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(wrapper.vm.$data.partner).toBe('hub.raiden.network');
  });
});
