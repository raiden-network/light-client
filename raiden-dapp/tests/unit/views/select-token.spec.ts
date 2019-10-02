import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import { addElemWithDataAppToBody } from '../utils/dialog';
import Vuex, { Store } from 'vuex';
import { TestData } from '../data/mock-data';
import SelectToken from '@/views/SelectToken.vue';
import Vuetify from 'vuetify';
import VueVirtualScroller from 'vue-virtual-scroller';
import { $identicon } from '../utils/mocks';

describe('SelectToken.vue', () => {
  addElemWithDataAppToBody();

  let wrapper: Wrapper<SelectToken>;

  beforeEach(() => {
    const localVue = createLocalVue();
    localVue.use(Vuex);
    localVue.use(Vuetify);
    localVue.use(VueVirtualScroller);
    localVue.filter('displayFormat', (v: string) => v);
    localVue.filter('truncate', (v: string) => v);

    wrapper = mount(SelectToken, {
      localVue,
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
          fetchTokenData: jest.fn().mockResolvedValue(null)
        },
        $t: (msg: string) => msg
      }
    });
  });

  test('renders', () => {
    expect(wrapper.findAll('.select-token__tokens__token').length).toEqual(1);
  });
});
