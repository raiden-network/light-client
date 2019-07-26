jest.mock('@/services/raiden-service');
jest.mock('vue-router');
jest.useFakeTimers();

import { Store } from 'vuex';
import VueRouter, { NavigationGuard } from 'vue-router';
import { mockInput } from '../utils/interaction-utils';
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

Vue.use(Vuetify);

describe('Deposit.vue', function() {
  let service: Mocked<RaidenService>;
  let wrapper: Wrapper<OpenChannel>;
  let button: Wrapper<Vue>;
  let router: Mocked<VueRouter>;

  function createWrapper(
    routeParams: {
      token?: string;
      partner?: string;
    },
    shallow: boolean = false,
    token: any = TestData.token
  ): Wrapper<OpenChannel> {
    const localVue = createLocalVue();
    const options = {
      localVue,
      store: new Store({
        getters: {
          token: jest.fn().mockReturnValue(() => token)
        }
      }),
      propsData: {
        current: 0
      },
      mixins: [NavigationMixin],
      mocks: {
        $raiden: service,
        $router: router,
        $route: TestData.mockRoute(routeParams)
      }
    };

    if (shallow) {
      return shallowMount(OpenChannel, options);
    }
    return mount(OpenChannel, options);
  }

  beforeAll(() => {
    service = new RaidenService(store) as Mocked<RaidenService>;
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockResolvedValue(null);
  });

  beforeEach(() => {
    router.push.mockReset();
  });

  afterEach(async () => {
    jest.clearAllTimers();
  });

  describe('valid route', function() {
    beforeAll(async () => {
      wrapper = createWrapper({
        token: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
        partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b'
      });
      await flushPromises();
      button = wrapper.find('#open-channel');
      await wrapper.vm.$nextTick();
    });

    it('should not be disabled after load', async function() {
      const button = wrapper.find('#open-channel');
      await flushPromises();
      expect(button.element.getAttribute('disabled')).toBeFalsy();
    });

    it('should show an error if channel opening failed', async function() {
      service.openChannel = jest
        .fn()
        .mockRejectedValue(new ChannelOpenFailed());
      button.trigger('click');
      const deposit = wrapper.vm;
      await flushPromises();
      expect(deposit.$data.error).toBe('Channel open failed.');
    });

    it('should had an error if deposit failed', async function() {
      service.openChannel = jest
        .fn()
        .mockRejectedValue(new ChannelDepositFailed());
      mockInput(wrapper, '0.0001');
      button.trigger('click');
      const deposit = wrapper.vm;
      await flushPromises();
      expect(deposit.$data.error).toBe('Could not deposit to the channel.');
    });

    it('should show an error if any error happens during channel opening', async function() {
      service.openChannel = jest.fn().mockRejectedValue(new Error('unknown'));
      mockInput(wrapper, '0.0001');
      button.trigger('click');
      const deposit = wrapper.vm;
      await flushPromises();
      expect(deposit.$data.error).toBe('unknown');
    });

    it('should navigate to send on success', async function() {
      const deposit = wrapper.vm;
      const loading = jest.spyOn(deposit.$data, 'loading', 'set');
      service.openChannel = jest.fn().mockResolvedValue(null);
      button.trigger('click');
      await flushPromises();
      jest.advanceTimersByTime(2000);
      expect(router.push).toHaveBeenCalledTimes(1);
      const args = router.push.mock.calls[0][0] as any;
      expect(args.name).toEqual(RouteNames.TRANSFER);
      expect(loading).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalid route', function() {
    test('navigating with non checksum token address', async () => {
      wrapper = createWrapper(
        {
          token: '0xc778417e063141139fce010982780140aa0cd5ab'
        },
        true
      );

      expect(router.push).toHaveBeenCalledTimes(1);
      const args = router.push.mock.calls[0][0] as any;
      expect(args.name).toEqual(RouteNames.HOME);
    });

    test('partner address is non checksum', () => {
      wrapper = createWrapper(
        {
          token: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
          partner: '0x1d36124c90f53d491b6832f1c073f43e2550e35b'
        },
        true
      );

      expect(router.push).toHaveBeenCalledTimes(1);
      const args = router.push.mock.calls[0][0] as any;
      expect(args.name).toEqual(RouteNames.SELECT_TOKEN);
    });

    test('token was could not be found', async () => {
      service.getToken = jest.fn().mockResolvedValue(null);
      wrapper = createWrapper(
        {
          token: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
          partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b'
        },
        true,
        null
      );
      await flushPromises();

      expect(router.push).toHaveBeenCalledTimes(1);
      const args = router.push.mock.calls[0][0] as any;
      expect(args.name).toEqual(RouteNames.HOME);
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
