import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex, { Store } from 'vuex';
import { mount } from '@vue/test-utils';
import { generateToken } from '../../utils/data-generator';
import { $identicon } from '../../utils/mocks';
import TokenListItem from '@/components/tokens/TokenListItem.vue';

Vue.use(Vuetify);
Vue.use(Vuex);

const token = generateToken();
const vuetify = new Vuetify();
const propsData = { token };
const store = new Store({
  getters: { token: () => (_tokenAddress: string) => null },
});

const mocks = {
  $identicon: $identicon(),
  $t: (msg: string) => msg,
};

const wrapper = mount(TokenListItem, {
  vuetify,
  store,
  propsData,
  mocks,
});

describe('TokenListItem.vue', () => {
  test('emit select event when clicking on item', () => {
    wrapper.element.click();

    const selectEvents = wrapper.emitted().select ?? [];
    expect(selectEvents.length).toBe(1);
    expect(selectEvents[0][0]).toEqual(token);
  });
});
