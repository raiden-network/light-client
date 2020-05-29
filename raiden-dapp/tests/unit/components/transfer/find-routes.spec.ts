import { mount } from '@vue/test-utils';
import FindRoutes from '@/components/transfer/FindRoutes.vue';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { RaidenPaths } from 'raiden-ts';
import { bigNumberify } from 'ethers/utils';
import { Token } from '@/model/types';
import { Zero } from 'ethers/constants';
import Filters from '@/filters';

Vue.use(Vuetify);
Vue.filter('dispayFormat', Filters.displayFormat);

describe('FindRoutes.vue', () => {
  let vuetify: typeof Vuetify;
  const routes = [
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
      mocks: {
        $t: (msg: string) => msg,
        $raiden
      },
      propsData: {
        token,
        routes,
        pfsUrl: 'http://pfs.test.raiden.network'
      }
    });
  }

  test('emit a select event when the user selects a route', async () => {
    const wrapper = createWrapper();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.find-routes__table').isVisible()).toBe(true);

    wrapper
      .findAll('.find-routes__table .v-data-table__checkbox')
      .trigger('click');
    await wrapper.vm.$nextTick();

    const selectEvent = wrapper.emitted('select');
    expect(selectEvent).toBeTruthy();
    expect(selectEvent?.shift()).toContainEqual({
      fee: bigNumberify(100),
      path: ['0x3a989D97388a39A0B5796306C615d10B7416bE77']
    });
  });
});
