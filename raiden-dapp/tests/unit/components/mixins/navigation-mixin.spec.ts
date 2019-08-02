jest.mock('vue-router');

import { RouteNames } from '@/route-names';
import { createLocalVue, shallowMount, Wrapper } from '@vue/test-utils';
import NavigationMixin from '@/mixins/navigation-mixin';
import VueRouter from 'vue-router';
import { TestData } from '../../data/mock-data';
import Mocked = jest.Mocked;

describe('NavigationMixin', function() {
  let wrapper: Wrapper<NavigationMixin>;
  let router: Mocked<VueRouter>;

  let args: () => any;

  beforeEach(async () => {
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockReturnValue(null);
    args = () => router.push.mock.calls[0][0];

    const localVue = createLocalVue();
    wrapper = shallowMount(NavigationMixin, {
      localVue,
      mocks: {
        $router: router,
        $route: TestData.mockRoute()
      }
    });
  });

  test('navigate to select hub', () => {
    wrapper.vm.navigateToSelectHub('0xtoken');
    expect(router.push).toHaveBeenCalledTimes(1);
    const callArgs = args();
    expect(callArgs.name).toEqual(RouteNames.SELECT_HUB);
    expect(callArgs.params.token).toEqual('0xtoken');
  });

  test('navigate to home', () => {
    wrapper.vm.navigateToHome();
    const callArgs = args();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(callArgs.name).toEqual(RouteNames.HOME);
  });

  test('navigate to deposit', () => {
    wrapper.vm.navigateToDeposit('0xtoken', '0xpartner');
    const callArgs = args();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(callArgs.name).toEqual(RouteNames.DEPOSIT);
    expect(callArgs.params.token).toEqual('0xtoken');
    expect(callArgs.params.partner).toEqual('0xpartner');
  });

  test('navigate to token select', () => {
    wrapper.vm.navigateToTokenSelect();
    const callArgs = args();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(callArgs.name).toEqual(RouteNames.SELECT_TOKEN);
  });

  test('navigate to select payment target', () => {
    wrapper.vm.navigateToSelectPaymentTarget('0xtoken');
    const callArgs = args();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(callArgs.name).toEqual(RouteNames.PAYMENT);
    expect(callArgs.params.token).toEqual('0xtoken');
  });

  describe('back navigation', () => {
    test('from select target', async () => {
      wrapper.vm.$route.name = RouteNames.PAYMENT;
      wrapper.vm.onBackClicked();
      const callArgs = args();
      expect(router.push).toHaveBeenCalledTimes(1);
      expect(callArgs.name).toEqual(RouteNames.HOME);
    });

    test('from select token', async () => {
      wrapper.vm.$route.name = RouteNames.SELECT_TOKEN;
      wrapper.vm.onBackClicked();
      const callArgs = args();
      expect(router.push).toHaveBeenCalledTimes(1);
      expect(callArgs.name).toEqual(RouteNames.HOME);
    });

    test('from select hub', async () => {
      wrapper.vm.$route.name = RouteNames.SELECT_HUB;
      wrapper.vm.onBackClicked();
      const callArgs = args();
      expect(router.push).toHaveBeenCalledTimes(1);
      expect(callArgs.name).toEqual(RouteNames.SELECT_TOKEN);
    });

    test('from channels', async () => {
      wrapper.vm.$route.name = RouteNames.CHANNELS;
      wrapper.vm.onBackClicked();
      const callArgs = args();
      expect(router.push).toHaveBeenCalledTimes(1);
      expect(callArgs.name).toEqual(RouteNames.HOME);
    });

    test('from deposit', async () => {
      wrapper.vm.$route.name = RouteNames.DEPOSIT;
      wrapper.vm.$route.params = {
        token: '0xtoken'
      };
      wrapper.vm.onBackClicked();
      const callArgs = args();
      expect(router.push).toHaveBeenCalledTimes(1);
      expect(callArgs.name).toEqual(RouteNames.SELECT_HUB);
      expect(callArgs.params.token).toEqual('0xtoken');
    });
  });
});
