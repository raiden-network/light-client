import { createLocalVue, mount, shallowMount, Wrapper } from '@vue/test-utils';
import { addElemWithDataAppToBody } from '../utils/dialog';
import Vuex, { Store } from 'vuex';
import Vuetify from 'vuetify';
import { TestData } from '../data/mock-data';
import SelectHub from '@/views/SelectHub.vue';
import VueRouter, { Route } from 'vue-router';
import { mockInput } from '../utils/interaction-utils';
import Mocked = jest.Mocked;
import { RouteNames } from '@/route-names';
import Vue from 'vue';

Vue.use(Vuetify);

describe('SelectHub.vue', function() {
  let wrapper: Wrapper<SelectHub>;
  let router: Mocked<VueRouter>;
  let callArgs: () => any;
  let vuetify: typeof Vuetify;

  const testToken = (address: string) =>
    Object.assign(TestData.token, {
      address: address
    });

  function createWrapper(
    route: Route,
    getter: any,
    token: any,
    shallow: boolean = false
  ) {
    const localVue = createLocalVue();
    localVue.use(Vuex);
    const options = {
      vuetify,
      localVue,
      store: new Store({
        getters: {
          token: jest.fn().mockReturnValue(() => getter)
        }
      }),
      mocks: {
        $route: route,
        $router: router,
        $identicon: {
          getIdenticon: jest.fn().mockResolvedValue('')
        },
        $raiden: {
          getToken: jest.fn().mockResolvedValue(token)
        },
        $t: (msg: string) => msg
      }
    };
    if (shallow) {
      return shallowMount(SelectHub, options);
    }
    return mount(SelectHub, options);
  }

  beforeEach(() => {
    addElemWithDataAppToBody();
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockResolvedValue(null);
    callArgs = () => router.push.mock.calls[0][0];
  });

  test('when select hub is clicked with ', async () => {
    const route = TestData.mockRoute({
      token: '0xc778417E063141139Fce010982780140Aa0cD5Ab'
    });
    const token = testToken('0xc778417E063141139Fce010982780140Aa0cD5Ab');
    wrapper = createWrapper(route, token, token);
    mockInput(wrapper, '0x1D36124C90f53d491b6832F1c073F43E2550E35b');
    await wrapper.vm.$nextTick();
    wrapper.find('button').trigger('click');
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(callArgs().name).toEqual(RouteNames.OPEN_CHANNEL);
  });

  test('when token address is not checksum should navigate to home', async () => {
    const route = TestData.mockRoute({
      token: '0xtoken'
    });
    wrapper = createWrapper(route, undefined, undefined, true);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(callArgs().name).toEqual(RouteNames.HOME);
  });

  test('when token is not cached it should be retrieved', async () => {
    const route = TestData.mockRoute({
      token: '0xc778417E063141139Fce010982780140Aa0cD5Ab'
    });
    const token = testToken('0xc778417E063141139Fce010982780140Aa0cD5Ab');
    wrapper = createWrapper(route, null, token, true);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.$data.token.address).toEqual(
      '0xc778417E063141139Fce010982780140Aa0cD5Ab'
    );
  });

  test('when token cannot be found will navigate to home', async () => {
    const route = TestData.mockRoute({
      token: '0xc778417E063141139Fce010982780140Aa0cD5Ab'
    });

    wrapper = createWrapper(route, null, null, true);
    await wrapper.vm.$nextTick();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(callArgs().name).toEqual(RouteNames.HOME);
  });
});
