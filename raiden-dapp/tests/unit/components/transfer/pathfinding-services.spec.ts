import { mount } from '@vue/test-utils';
import { BigNumber, constants } from 'ethers';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';

import type { RaidenPFS } from 'raiden-ts';

import PathfindingServices from '@/components/transfer/PathfindingServices.vue';
import type { Token } from '@/model/types';
import store from '@/store';
import type { Tokens } from '@/types';

Vue.use(Vuetify);

describe('PathfindingService.vue', () => {
  let vuetify: Vuetify;

  const $raiden = {
    fetchAndUpdateTokenData: jest.fn().mockResolvedValueOnce(undefined),
    fetchServices: jest.fn(),
  };
  const matrixServer = 'http://transport.pfs.raiden.test';

  const raidenPFS: RaidenPFS = {
    address: '0x94DEe8e391410A9ebbA791B187df2d993212c849',
    price: BigNumber.from(100),
    rtt: 62,
    token: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    url: 'https://pfs-goerli-with-fee.services-test.raiden.network',
    validTill: Date.now() + 86.4e6,
    matrixServer,
  };

  const raidenPFS2: RaidenPFS = {
    address: '0x3a471e23a2281e6C131441fC622e8107CE214043',
    price: BigNumber.from(100),
    rtt: 171,
    token: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    url: 'https://pfs-goerli.services-test.raiden.network',
    validTill: Date.now() + 86.4e6,
    matrixServer,
  };

  function createWrapper() {
    vuetify = new Vuetify();
    return mount(PathfindingServices, {
      store,
      vuetify,
      mocks: {
        $t: (msg: string) => msg,
        $raiden,
      },
    });
  }

  beforeAll(() => {
    store.commit('updateTokens', {
      '0x3a989D97388a39A0B5796306C615d10B7416bE77': {
        address: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
        name: 'ServiceToken',
        symbol: 'SVT',
        decimals: 18,
        balance: constants.Zero,
      } as Token,
    } as Tokens);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('emit a select event when the user selects a service', async () => {
    $raiden.fetchServices.mockResolvedValueOnce([raidenPFS, raidenPFS2]);
    const wrapper = createWrapper();

    await wrapper.vm.$nextTick();

    const spinner = wrapper.find('.spinner');
    expect(spinner.exists()).toBe(true);

    await flushPromises();

    expect(spinner.exists()).toBe(false);

    const pfsTable = wrapper.find('.pathfinding-services__table');
    expect(pfsTable.exists()).toBe(true);

    wrapper.findAll('.pathfinding-services tbody tr').at(1).trigger('click');
    await wrapper.vm.$nextTick();
    const selectEvent = wrapper.emitted('select');

    expect(selectEvent).toBeTruthy();
    expect(selectEvent?.shift()).toContainEqual([raidenPFS, false]);
  });

  test('show an error message when the request for the services fails', async () => {
    $raiden.fetchServices.mockRejectedValue(new Error('there was an error'));
    const wrapper = createWrapper();
    await wrapper.vm.$nextTick();
    await flushPromises();
    expect(wrapper.vm.$data.error).toBeDefined();
    expect(wrapper.vm.$data.error).toMatchObject({
      message: 'there was an error',
    });
  });
});
