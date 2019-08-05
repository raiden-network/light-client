import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import Channels from '@/views/Channels.vue';
import Vuex, { Store } from 'vuex';
import { TestData } from '../data/mock-data';
import Vuetify from 'vuetify';
import { addElemWithDataAppToBody } from '../utils/dialog';
import Filters from '@/filters';
import Vue from 'vue';

Vue.use(Vuetify);

describe('Channels.vue', () => {
  let wrapper: Wrapper<Channels>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    addElemWithDataAppToBody();
    vuetify = new Vuetify();
    const localVue = createLocalVue();
    localVue.use(Vuex);
    localVue.filter('displayFormat', Filters.displayFormat);
    let mockIdenticon = jest.fn().mockResolvedValue('');
    const $identicon = {
      getIdenticon: mockIdenticon
    };

    wrapper = mount(Channels, {
      localVue,
      vuetify,
      store: new Store({
        getters: {
          channels: jest.fn().mockReturnValue(() => TestData.mockChannelArray)
        }
      }),
      mocks: {
        $route: TestData.mockRoute({
          token: '0xtoken'
        }),
        $identicon: $identicon,
        $raiden: {
          getToken: jest.fn().mockResolvedValue(TestData.token)
        },
        $t: (msg: string) => msg
      }
    });
  });
  test('renders the test data', () => {
    expect(wrapper.findAll('.channel-list__channels__channel').length).toEqual(
      4
    );
  });

  test('dismiss the confirmation when overlay is pressed', function() {
    wrapper.setData({
      visible: 'channel-278-deposit'
    });

    expect(wrapper.vm.$data['visible']).toBe('channel-278-deposit');
    wrapper.find('.channels__overlay').trigger('click');
    expect(wrapper.vm.$data['visible']).toBe('');
  });
});
