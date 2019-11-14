import { mount } from '@vue/test-utils';
import FindRoutes from '@/components/FindRoutes.vue';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { RaidenPaths } from 'raiden-ts';
import { bigNumberify } from 'ethers/utils';
import { Token } from '@/model/types';
import { Zero } from 'ethers/constants';
import flushPromises from 'flush-promises';

Vue.use(Vuetify);

describe('FindRoutes.vue', () => {
  let vuetify: typeof Vuetify;
  const raidenPaths = [
    {
      path: ['0x3a989D97388a39A0B5796306C615d10B7416bE77'],
      fee: bigNumberify(100)
    }
  ] as RaidenPaths;

  const token = {
    address: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    name: 'Test Token',
    symbol: 'TTT',
    decimals: 18,
    balance: Zero
  } as Token;

  const $raiden = {
    findRoutes: jest.fn()
  };

  function createWrapper() {
    vuetify = new Vuetify();
    return mount(FindRoutes, {
      vuetify,
      sync: false,
      mocks: {
        $t: (msg: string) => msg,
        $raiden
      },
      propsData: {
        token,
        target: '',
        amount: '100000'
      }
    });
  }

  test('user selects a route', async () => {
    $raiden.findRoutes.mockResolvedValueOnce(raidenPaths);
    const wrapper = createWrapper();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.find-routes__spinner-wrapper').isVisible()).toBe(
      true
    );

    await flushPromises();

    expect(wrapper.find('.find-routes__spinner-wrapper').exists()).toBe(false);
    expect(wrapper.find('.find-routes__table').isVisible()).toBe(true);

    wrapper
      .findAll('.find-routes__table .v-data-table__checkbox')
      .trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted().select).toBeTruthy();
    expect(wrapper.emitted().select[0][0]).toEqual({
      displayFee: '0.0000000000000001',
      fee: bigNumberify(100),
      hops: 0,
      key: 0,
      path: ['0x3a989D97388a39A0B5796306C615d10B7416bE77']
    });
  });

  test('the request fails with some error', async () => {
    $raiden.findRoutes.mockRejectedValue(new Error('there was an error'));
    const wrapper = createWrapper();
    await wrapper.vm.$nextTick();
    await flushPromises();
    expect(wrapper.find('.find-routes__error').isVisible()).toBe(true);
    expect(wrapper.find('.find-routes__error').text()).toMatch(
      'there was an error'
    );
  });
});
