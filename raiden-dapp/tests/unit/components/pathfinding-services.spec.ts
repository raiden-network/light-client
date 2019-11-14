import { mount } from '@vue/test-utils';
import PathfindingServices from '@/components/PathfindingServices.vue';
import store from '@/store/index';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { RaidenPFS } from 'raiden-ts';
import { bigNumberify } from 'ethers/utils';
import { Tokens } from '@/types';
import { Token } from '@/model/types';
import { Zero } from 'ethers/constants';
import flushPromises from 'flush-promises';

Vue.use(Vuetify);

describe('PathfindingService.vue', () => {
  let vuetify: typeof Vuetify;

  const $raiden = {
    fetchTokenData: jest.fn().mockResolvedValueOnce(undefined),
    fetchServices: jest.fn()
  };

  const raidenPFS: RaidenPFS = {
    address: '0x94DEe8e391410A9ebbA791B187df2d993212c849',
    price: bigNumberify(100),
    rtt: 62,
    token: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    url: 'https://pfs-goerli-with-fee.services-test.raiden.network'
  };

  const raidenPFS2: RaidenPFS = {
    address: '0x3a471e23a2281e6C131441fC622e8107CE214043',
    price: bigNumberify(100),
    rtt: 171,
    token: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    url: 'https://pfs-goerli.services-test.raiden.network'
  };

  function createWrapper() {
    vuetify = new Vuetify();
    return mount(PathfindingServices, {
      store,
      vuetify,
      sync: false,
      mocks: {
        $t: (msg: string) => msg,
        $raiden
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

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('user selects PFS service from available', async () => {
    $raiden.fetchServices.mockResolvedValueOnce([raidenPFS, raidenPFS2]);
    const wrapper = createWrapper();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.pathfinding-services__loading').isVisible()).toBe(
      true
    );
    await flushPromises();
    expect(wrapper.find('.pathfinding-services__loading').exists()).toBe(false);
    expect(wrapper.find('.pathfinding-services__table').isVisible()).toBe(true);

    wrapper
      .findAll('.pathfinding-services tbody tr')
      .at(1)
      .trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted().select).toBeTruthy();
    expect(wrapper.emitted().select[0][0]).toEqual(raidenPFS);
  });

  test('the request fails with some error', async () => {
    $raiden.fetchServices.mockRejectedValue(new Error('there was an error'));
    const wrapper = createWrapper();
    await wrapper.vm.$nextTick();
    await flushPromises();
    expect(wrapper.find('.pathfinding-services__error').isVisible()).toBe(true);
    expect(wrapper.find('.pathfinding-services__error span').text()).toMatch(
      'there was an error'
    );
  });
});
