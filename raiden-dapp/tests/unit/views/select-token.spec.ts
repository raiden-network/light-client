import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import { addElemWithDataAppToBody } from '../utils/dialog';
import Vuex, { Store } from 'vuex';
import { TestData } from '../data/mock-data';
import SelectToken from '@/views/SelectToken.vue';
import Vuetify from 'vuetify';

describe('SelectToken.vue', function() {
  let wrapper: Wrapper<SelectToken>;

  beforeEach(() => {
    addElemWithDataAppToBody();
    const localVue = createLocalVue();
    localVue.use(Vuex);
    localVue.use(Vuetify);
    let mockIdenticon = jest.fn().mockResolvedValue('');
    const $identicon = {
      getIdenticon: mockIdenticon
    };

    wrapper = mount(SelectToken, {
      localVue,
      store: new Store({
        getters: {
          allTokens: jest.fn().mockReturnValue([TestData.token])
        }
      }),
      mocks: {
        $route: TestData.mockRoute({
          token: '0xtoken'
        }),
        $identicon: $identicon,
        $raiden: {
          getToken: jest.fn().mockResolvedValue(TestData.token)
        }
      }
    });
  });

  test('renders', () => {
    expect(wrapper.findAll('.token').length).toEqual(1);
  });
});
