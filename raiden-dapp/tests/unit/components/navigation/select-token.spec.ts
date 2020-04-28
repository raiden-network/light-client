import { mount, Wrapper } from '@vue/test-utils';
import Vuex, { Store } from 'vuex';
import { TestData } from '../../data/mock-data';
import SelectToken from '@/components/navigation/SelectToken.vue';
import Vuetify from 'vuetify';
import VueVirtualScroller from 'vue-virtual-scroller';
import { $identicon } from '../../utils/mocks';
import Vue from 'vue';

Vue.use(Vuex);
Vue.use(Vuetify);
Vue.use(VueVirtualScroller);
Vue.filter('displayFormat', (v: string) => v);
Vue.filter('truncate', (v: string) => v);

describe('SelectToken.vue', () => {
  let wrapper: Wrapper<SelectToken>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(SelectToken, {
      vuetify,
      store: new Store({
        getters: {
          allTokens: jest.fn().mockReturnValue([TestData.token])
        },
        state: {
          tokens: { [TestData.token.address]: TestData.token }
        }
      }),
      mocks: {
        $route: TestData.mockRoute({
          token: '0xtoken'
        }),
        $identicon: $identicon(),
        $raiden: {
          getToken: jest.fn().mockResolvedValue(TestData.token),
          fetchTokenList: jest.fn().mockResolvedValue(null)
        },
        $t: (msg: string) => msg
      }
    });
  });

  test('renders', () => {
    expect(wrapper.findAll('.select-token__tokens__token').length).toEqual(1);
  });
});
