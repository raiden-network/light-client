import { $t } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';

import { RouteNames } from '@/router/route-names';
import NoConnectedTokenRoute from '@/views/NoConnectedTokenRoute.vue';

jest.mock('vue-router');

Vue.use(Vuetify);

const vuetify = new Vuetify();
const $router = new VueRouter();

function createWrapper(): Wrapper<NoConnectedTokenRoute> {
  return mount(NoConnectedTokenRoute, { vuetify, mocks: { $router, $t } });
}

describe('NoConnetedTokenRoute.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('displays button to connect new token', () => {
    const wrapper = createWrapper();
    const connectButton = wrapper.find('.no-connected-token__connect-button');

    expect(connectButton.isVisible()).toBeTruthy();
  });

  test('displays label to guide the user', () => {
    const wrapper = createWrapper();
    const connectLabel = wrapper.find('.no-connected-token__connect-label');

    expect(connectLabel.isVisible()).toBeTruthy();
    expect(connectLabel.text()).toBe('tokens.connect-new');
  });

  test('navigates to select token route when clicking button', async () => {
    const wrapper = createWrapper();
    const connectButton = wrapper.get('.no-connected-token__connect-button');

    connectButton.trigger('click');

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith({ name: RouteNames.SELECT_TOKEN });
  });
});
