import { $identicon } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex, { Store } from 'vuex';

import ListHeader from '@/components/ListHeader.vue';
import TokenList from '@/components/tokens/TokenList.vue';
import TokenListItem from '@/components/tokens/TokenListItem.vue';
import type { Token } from '@/model/types';

import { generateToken } from '../../utils/data-generator';

Vue.use(Vuetify);
Vue.use(Vuex);

const tokenOne = generateToken();
const tokenTwo = generateToken();

function createWrapper(
  properties: {
    header?: string;
    tokens?: Token[];
  } = {},
): Wrapper<TokenList> {
  const vuetify = new Vuetify();
  const propsData = { tokens: [], ...properties };
  const store = new Store({
    getters: { token: () => (_tokenAddress: string) => null },
  });

  const mocks = {
    $identicon: $identicon(),
    $t: (msg: string) => msg,
    $raiden: {
      fetchAndUpdateTokenData: jest.fn(),
    },
  };

  return mount(TokenList, {
    vuetify,
    propsData,
    store,
    mocks,
  });
}

describe('TokenList.vue', () => {
  test('do not display list header if not defined', () => {
    const wrapper = createWrapper();
    const listHeader = wrapper.findComponent(ListHeader);
    expect(listHeader.exists()).toBe(false);
  });

  test('display list header if defined', () => {
    const wrapper = createWrapper({ header: 'test' });
    const listHeader = wrapper.findComponent(ListHeader);
    expect(listHeader.exists()).toBe(true);
  });

  test('do not display tokens if list is empty', () => {
    const wrapper = createWrapper();
    const tokenListItems = wrapper.findAllComponents(TokenListItem);
    expect(tokenListItems.length).toBe(0);
  });

  test('display tokens if list is not empty', () => {
    const wrapper = createWrapper({ tokens: [tokenOne, tokenTwo] });
    const tokenListItems = wrapper.findAllComponents(TokenListItem);
    expect(tokenListItems.length).toBe(2);
  });

  test('receive event emitted when clicking on token list item', () => {
    const wrapper = createWrapper({ tokens: [tokenOne] });
    const tokenListItem = wrapper.findComponent(TokenListItem);

    (tokenListItem.element as HTMLElement).click();

    const selectEvents = wrapper.emitted().select ?? [];
    expect(selectEvents.length).toBe(1);
    expect(selectEvents[0][0]).toEqual(tokenOne);
  });
});
