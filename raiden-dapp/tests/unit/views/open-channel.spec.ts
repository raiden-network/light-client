import Filters from '@/filters';

jest.mock('@/services/raiden-service');
jest.mock('vue-router');
jest.useFakeTimers();

import VueRouter, { NavigationGuard } from 'vue-router';
import flushPromises from 'flush-promises';
import { mount, shallowMount, Wrapper } from '@vue/test-utils';
import OpenChannel from '@/views/OpenChannel.vue';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { TestData } from '../data/mock-data';
import store from '@/store/index';
import NavigationMixin from '@/mixins/navigation-mixin';
import { RouteNames } from '@/router/route-names';
import Mocked = jest.Mocked;
import { Token } from '@/model/types';
import { Tokens } from '@/types';
import { mockInput } from '../utils/interaction-utils';
import { parseUnits } from 'ethers/utils';
import { RaidenError, ErrorCodes } from 'raiden-ts';
import RaidenService from '@/services/raiden-service';

Vue.use(Vuetify);
Vue.filter('truncate', Filters.truncate);

describe('OpenChannel.vue', () => {
  let service: Mocked<RaidenService>;
  let wrapper: Wrapper<OpenChannel>;
  let vuetify: typeof Vuetify;
  let button: Wrapper<Vue>;
  let router: Mocked<VueRouter>;

  function createWrapper(
    routeParams: {
      token?: string;
      partner?: string;
    },
    shallow: boolean = false
  ): Wrapper<OpenChannel> {
    const options = {
      vuetify,
      store,
      stubs: ['v-dialog'],
      propsData: {
        current: 0
      },
      mixins: [NavigationMixin],
      mocks: {
        $raiden: service,
        $router: router,
        $route: TestData.mockRoute(routeParams),
        $t: (msg: string) => msg,
        $te: (msg: string) => msg
      }
    };

    if (shallow) {
      return shallowMount(OpenChannel, options);
    }
    return mount(OpenChannel, options);
  }

  beforeAll(() => {
    service = new RaidenService(store) as Mocked<RaidenService>;
    service.fetchTokenData = jest.fn().mockResolvedValue(undefined);
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockResolvedValue(null);
  });

  beforeEach(() => {
    router.push.mockReset();
  });

  afterEach(async () => {
    jest.clearAllTimers();
  });

  describe('valid route', () => {
    beforeAll(async () => {
      store.commit('updateTokens', {
        '0xc778417E063141139Fce010982780140Aa0cD5Ab': {
          address: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
          decimals: 10,
          balance: parseUnits('2', 10)
        } as Token
      } as Tokens);
      wrapper = createWrapper({
        token: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
        partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b'
      });

      button = wrapper.find('button');
      await wrapper.vm.$nextTick();
      service.openChannel = jest.fn();
    });

    afterEach(() => {
      service.openChannel.mockReset();
    });

    test('should be disabled after load', async () => {
      await flushPromises();
      expect(button.element.getAttribute('disabled')).toBe('disabled');
    });

    test('show an error when a channel open fails', async () => {
      service.openChannel.mockRejectedValueOnce(
        new RaidenError(ErrorCodes.CNL_OPENCHANNEL_FAILED)
      );

      mockInput(wrapper, '0.1');
      await wrapper.vm.$nextTick();
      await flushPromises();
      button.trigger('click');
      await wrapper.vm.$nextTick();
      await flushPromises();
      expect(wrapper.vm.$data.error).toMatchObject({
        code: 'CNL_OPENCHANNEL_FAILED'
      });
      await flushPromises();
    });

    test('show an error when the deposit fails', async () => {
      service.openChannel.mockRejectedValueOnce(
        new RaidenError(ErrorCodes.RDN_DEPOSIT_TRANSACTION_FAILED)
      );

      mockInput(wrapper, '0.1');
      button.trigger('click');
      await wrapper.vm.$nextTick();
      await flushPromises();
      expect(wrapper.vm.$data.error).toMatchObject({
        code: 'RDN_DEPOSIT_TRANSACTION_FAILED'
      });
      await flushPromises();
    });

    test('show an error when any error occurs during channel opening', async () => {
      service.openChannel.mockRejectedValueOnce(new Error('unknown'));
      mockInput(wrapper, '0.1');
      button.trigger('click');
      await wrapper.vm.$nextTick();
      await flushPromises();
      expect(wrapper.vm.$data.error).toMatchObject({ message: 'unknown' });
      await flushPromises();
    });

    test('navigate to the "Transfer" view when the channel opens', async () => {
      const loading = jest.spyOn(wrapper.vm.$data, 'loading', 'set');
      service.openChannel.mockResolvedValue(undefined);
      button.trigger('click');
      await wrapper.vm.$nextTick();
      await flushPromises();
      jest.advanceTimersByTime(2000);
      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.TRANSFER
        })
      );
      expect(loading).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalid route', () => {
    beforeAll(() => {
      service.fetchTokenData = jest.fn().mockResolvedValue(null);
    });

    afterEach(() => {
      store.commit('reset');
    });

    test('navigate to "Home" when the address is not in checksum format', async () => {
      wrapper = createWrapper(
        {
          token: '0xc778417e063141139fce010982780140aa0cd5ab'
        },
        true
      );

      await flushPromises();

      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.HOME
        })
      );
    });

    test('navigate to "SelectToken" when partner address is not in checksum format', async () => {
      store.commit('updateTokens', {
        '0xc778417E063141139Fce010982780140Aa0cD5Ab': {
          address: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
          decimals: 18
        }
      });
      wrapper = createWrapper(
        {
          token: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
          partner: '0x1d36124c90f53d491b6832f1c073f43e2550e35b'
        },
        true
      );

      await flushPromises();

      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.SELECT_TOKEN
        })
      );
    });

    test('navigate to "Home" when token cannot be found', async () => {
      wrapper = createWrapper(
        {
          token: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
          partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b'
        },
        true
      );
      await flushPromises();

      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.HOME
        })
      );
    });
  });

  describe('navigation guard', () => {
    let beforeRouteLeave: NavigationGuard;
    beforeEach(() => {
      wrapper = createWrapper(
        {
          token: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
          partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b'
        },
        true
      );
      const vm = wrapper.vm as any;
      beforeRouteLeave = vm.beforeRouteLeave as NavigationGuard;
    });

    test('do not block when it is not loading', () => {
      const next = jest.fn();
      const mockRoute = TestData.mockRoute();
      beforeRouteLeave(mockRoute, mockRoute, next);
      expect(next).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    test('request the user to confirm and then navigate', () => {
      window.confirm = jest.fn().mockReturnValue(true);
      const next = jest.fn();
      const mockRoute = TestData.mockRoute();
      wrapper.setData({
        loading: true
      });
      beforeRouteLeave(mockRoute, mockRoute, next);
      expect(next).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    test('request the user to confirm and block navigation on cancel', () => {
      window.confirm = jest.fn().mockReturnValue(false);
      const next = jest.fn();
      const mockRoute = TestData.mockRoute();
      wrapper.setData({
        loading: true
      });
      beforeRouteLeave(mockRoute, mockRoute, next);
      expect(next).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(false);
    });
  });
});
