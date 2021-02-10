/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import HeaderContent from '@/components/HeaderContent.vue';
import { RouteNames } from '@/router/route-names';

Vue.use(Vuex);
Vue.use(Vuetify);

const network = 'Selected Network';

const createWrapper = (
  routeName: string = RouteNames.CHANNELS,
  connected = true,
  showNetwork = true,
  disableBackButton = false,
  disableInfoButton = false,
): Wrapper<HeaderContent> => {
  const vuetify = new Vuetify();
  const getters = {
    network: () => network,
    isConnected: () => connected,
  };
  const store = new Vuex.Store({ getters });

  return mount(HeaderContent, {
    vuetify,
    store,
    mocks: {
      $t: (msg: string) => msg,
      $route: {
        name: routeName,
        meta: {
          title: 'title',
          infoOverlay: {},
        },
      },
    },
    propsData: {
      showNetwork,
      disableBackButton,
      disableInfoButton,
    },
  });
};

describe('HeaderContent.vue', () => {
  test('cannot navigate back if not connected', () => {
    const wrapper = createWrapper(RouteNames.CHANNELS, false);
    expect((wrapper.vm as any).canNavigateBack).toBe(false);
  });

  test('cannot navigate back if back button is disabled', () => {
    const wrapper = createWrapper(RouteNames.CHANNELS, true, true, true);
    expect((wrapper.vm as any).canNavigateBack).toBe(false);
  });

  test('can navigate back if connected', async () => {
    const wrapper = createWrapper();
    (wrapper.vm as any).navigateBack = jest.fn();

    expect((wrapper.vm as any).canNavigateBack).toBe(true);

    const backButton = wrapper.findAll('button').at(0);
    backButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).navigateBack).toHaveBeenCalledTimes(1);
  });

  test('displays network when showNetwork is true', () => {
    const wrapper = createWrapper();
    const networkName = wrapper.find('.header-content__title__network');

    expect(networkName.text()).toContain(network);
  });

  test('does not display network when showNetwork is false', () => {
    const wrapper = createWrapper(RouteNames.CHANNELS, true, false);
    const networkName = wrapper.find('.header-content__title__network');

    expect(networkName.exists()).toBe(false);
  });

  test('emits showInfo when information icon is clicked', async () => {
    const wrapper = createWrapper();
    (wrapper.vm as any).showInfo = jest.fn();

    const informationButton = wrapper.get('.header-content__title__route__info__icon');
    informationButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).showInfo).toHaveBeenCalledTimes(1);
  });

  test('does not display showInfo icon if disabled', () => {
    const wrapper = createWrapper(RouteNames.CHANNELS, true, false, false, true);
    const networkName = wrapper.find('.header-content__title__route__info__icon');

    expect(networkName.exists()).toBe(false);
  });
});
