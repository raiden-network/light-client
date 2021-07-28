/* eslint-disable @typescript-eslint/no-explicit-any */
import { $identicon } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex, { Store } from 'vuex';

import TokenOverlay from '@/components/overlays/TokenOverlay.vue';
import TokenList from '@/components/tokens/TokenList.vue';
import TokenListItem from '@/components/tokens/TokenListItem.vue';

import { generateToken } from '../../utils/data-generator';

Vue.use(Vuetify);
Vue.use(Vuex);

const token = generateToken();

function createWrapper(tokenAddressParameter = '0xToken'): Wrapper<TokenOverlay> {
  const vuetify = new Vuetify();
  const store = new Store({
    getters: {
      token: () => (_tokenAddress: string) => null,
      tokens: () => [token],
    },
  });

  const mocks = {
    $identicon: $identicon(),
    $t: (msg: string) => msg,
    $route: { params: { token: tokenAddressParameter } },
    $raiden: {
      fetchAndUpdateTokenData: jest.fn(),
    },
  };

  const wrapper = mount(TokenOverlay, {
    vuetify,
    store,
    mocks,
  });

  (wrapper.vm as any).navigateToTokenSelect = jest.fn();
  (wrapper.vm as any).navigateToSelectTransferTarget = jest.fn();
  return wrapper;
}

describe('TokenOverlay.vue', () => {
  test('shows token list', () => {
    const wrapper = createWrapper();
    const tokenList = wrapper.findComponent(TokenList);
    expect(tokenList.exists()).toBe(true);
  });

  test('emit a cancel event when pressing the close button', async () => {
    const wrapper = createWrapper();
    const closeButton = wrapper.find('.token-overlay__close-button');

    closeButton.trigger('click');

    const cancelEvents = wrapper.emitted().cancel ?? [];
    expect(cancelEvents.length).toBe(1);
  });

  test('navigates to the token select route when clicking on connect new', () => {
    const wrapper = createWrapper();
    const connectNew = wrapper.find('.token-overlay__connect-new');

    connectNew.trigger('click');

    expect((wrapper.vm as any).navigateToTokenSelect).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as any).navigateToTokenSelect).toHaveBeenCalledWith();
  });

  test('navigates to transfer route with changede token when token got selected', () => {
    const wrapper = createWrapper();
    const tokenListItem = wrapper.findComponent(TokenListItem);

    (tokenListItem.element as HTMLElement).click();

    expect((wrapper.vm as any).navigateToSelectTransferTarget).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as any).navigateToSelectTransferTarget).toHaveBeenCalledWith(token.address);
  });

  test('emit a cancel event when selecting already active token again', () => {
    const wrapper = createWrapper(token.address);
    const tokenListItem = wrapper.findComponent(TokenListItem);

    (tokenListItem.element as HTMLElement).click();

    const cancelEvents = wrapper.emitted().cancel ?? [];
    expect(cancelEvents.length).toBe(1);
  });
});
