/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex, { Store } from 'vuex';

import TokenList from '@/components/tokens/TokenList.vue';
import SelectTokenRoute from '@/views/SelectTokenRoute.vue';

import { generateToken } from '../utils/data-generator';

Vue.use(Vuetify);
Vue.use(Vuex);

const token = generateToken();

describe('SelectTokenRoute.vue', () => {
  let wrapper: Wrapper<SelectTokenRoute>;

  beforeEach(() => {
    const vuetify = new Vuetify();
    wrapper = shallowMount(SelectTokenRoute, {
      vuetify,
      store: new Store({
        getters: {
          allTokens: () => [token],
        },
      }),
      mocks: {
        $t: (msg: string) => msg,
        $raiden: {
          fetchTokenList: async () => null,
        },
      },
    });

    (wrapper.vm as any).navigateToSelectHub = jest.fn();
  });

  test('shows token list', () => {
    const tokenList = wrapper.findComponent(TokenList);
    expect(tokenList.exists()).toBe(true);
  });

  test('navigates to the select hub route with address of given token', () => {
    (wrapper.vm as any).selectToken(token);
    expect((wrapper.vm as any).navigateToSelectHub).toHaveBeenCalledWith(token.address);
  });
});
