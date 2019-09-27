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

  beforeEach(async () => {
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockReturnValue(null);

    const localVue = createLocalVue();
    const component = {
      render() {},
      mixins: [NavigationMixin]
    };

    wrapper = shallowMount(component as any, {
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
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.SELECT_HUB,
        params: {
          token: '0xtoken'
        }
      })
    );
  });

  test('navigate to home', () => {
    wrapper.vm.navigateToHome();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.HOME
      })
    );
  });

  test('navigate to open-channel', () => {
    wrapper.vm.navigateToOpenChannel('0xtoken', '0xpartner');

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.OPEN_CHANNEL,
        params: {
          token: '0xtoken',
          partner: '0xpartner'
        }
      })
    );
  });

  test('navigate to token select', () => {
    wrapper.vm.navigateToTokenSelect();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.SELECT_TOKEN
      })
    );
  });

  test('navigate to payment target', () => {
    wrapper.vm.navigateToSelectPaymentTarget('0xtoken');

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.PAYMENT,
        params: {
          token: '0xtoken'
        }
      })
    );
  });

  describe('back navigation', () => {
    test('from select target', async () => {
      wrapper.vm.$route.name = RouteNames.PAYMENT;
      wrapper.vm.onBackClicked();

      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.HOME
        })
      );
    });

    test('from select token', async () => {
      wrapper.vm.$route.name = RouteNames.SELECT_TOKEN;
      wrapper.vm.onBackClicked();

      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.HOME
        })
      );
    });

    test('from select hub', async () => {
      wrapper.vm.$route.name = RouteNames.SELECT_HUB;
      wrapper.vm.onBackClicked();

      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.SELECT_TOKEN
        })
      );
    });

    test('from channels', async () => {
      wrapper.vm.$route.name = RouteNames.CHANNELS;
      wrapper.vm.onBackClicked();

      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.HOME
        })
      );
    });

    test('from open-channel', async () => {
      wrapper.vm.$route.name = RouteNames.OPEN_CHANNEL;
      wrapper.vm.$route.params = {
        token: '0xtoken'
      };
      wrapper.vm.onBackClicked();

      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.SELECT_HUB,
          params: {
            token: '0xtoken'
          }
        })
      );
    });
  });
});
