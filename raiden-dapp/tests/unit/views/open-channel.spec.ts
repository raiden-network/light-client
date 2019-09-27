jest.mock('@/services/raiden-service');
jest.mock('vue-router');
jest.useFakeTimers();

import VueRouter, { NavigationGuard } from 'vue-router';
import flushPromises from 'flush-promises';
import { createLocalVue, mount, shallowMount, Wrapper } from '@vue/test-utils';
import OpenChannel from '@/views/OpenChannel.vue';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { TestData } from '../data/mock-data';
import RaidenService, {
  ChannelDepositFailed,
  ChannelOpenFailed
} from '@/services/raiden-service';
import store from '@/store';
import NavigationMixin from '@/mixins/navigation-mixin';
import { RouteNames } from '@/route-names';
import Mocked = jest.Mocked;
import { Token } from '@/model/types';
import { Tokens } from '@/types';
import { mockInput } from '../utils/interaction-utils';
import { parseUnits } from 'ethers/utils';

Vue.use(Vuetify);

describe('OpenChannel.vue', function() {
  let service: Mocked<RaidenService>;
  let wrapper: Wrapper<OpenChannel>;
  let button: Wrapper<Vue>;
  let router: Mocked<VueRouter>;

  function createWrapper(
    routeParams: {
      token?: string;
      partner?: string;
    },
    shallow: boolean = false
  ): Wrapper<OpenChannel> {
    const localVue = createLocalVue();
    const options = {
      localVue,
      store,
      propsData: {
        current: 0
      },
      mixins: [NavigationMixin],
      mocks: {
        $raiden: service,
        $router: router,
        $route: TestData.mockRoute(routeParams),
        $t: (msg: string) => msg
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

    it('should not be disabled after load', async function() {
      await flushPromises();
      expect(button.element.getAttribute('disabled')).toBeFalsy();
    });

    it('should show an error if channel opening failed', async () => {
      service.openChannel.mockRejectedValueOnce(
        new ChannelOpenFailed('open: transaction failed')
      );

      mockInput(wrapper, '0.1');
      button.trigger('click');
      await wrapper.vm.$nextTick();
      await flushPromises();
      expect(wrapper.vm.$data.error).toBe('open-channel.error.open-failed');
      await flushPromises();
    });

    it('should had an error if deposit failed', async () => {
      service.openChannel.mockRejectedValueOnce(
        new ChannelDepositFailed('deposit: transaction failed')
      );

      mockInput(wrapper, '0.1');
      button.trigger('click');
      await wrapper.vm.$nextTick();
      await flushPromises();
      expect(wrapper.vm.$data.error).toBe('open-channel.error.deposit-failed');
      await flushPromises();
    });

    it('should show an error if any error happens during channel opening', async () => {
      service.openChannel.mockRejectedValueOnce(new Error('unknown'));
      mockInput(wrapper, '0.1');
      button.trigger('click');
      await wrapper.vm.$nextTick();
      await flushPromises();
      expect(wrapper.vm.$data.error).toBe('unknown');
      await flushPromises();
    });

    it('should navigate to send on success', async () => {
      const loading = jest.spyOn(wrapper.vm.$data, 'loading', 'set');
      service.openChannel.mockResolvedValue(undefined);
      button.trigger('click');
      await wrapper.vm.$nextTick();
      await flushPromises();
      jest.advanceTimersByTime(2000);
      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.PAYMENT
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

    test('navigating with non checksum token address', async () => {
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

    test('partner address is non checksum', async () => {
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

    test('token was could not be found', async () => {
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

    test('wont block if not loading', () => {
      const next = jest.fn();
      const mockRoute = TestData.mockRoute();
      beforeRouteLeave(mockRoute, mockRoute, next);
      expect(next).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    test('requests user action and allow navigation on confirm', () => {
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

    test('requests user action and block navigation on cancel', () => {
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
