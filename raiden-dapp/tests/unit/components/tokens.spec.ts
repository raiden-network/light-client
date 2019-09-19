jest.mock('@/services/raiden-service');

import { addElemWithDataAppToBody } from '../utils/dialog';
import { $identicon } from '../utils/mocks';
import store from '@/store';
import Vue from 'vue';
import Vuex, { Store } from 'vuex';
import Vuetify from 'vuetify';
import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import Tokens from '@/components/Tokens.vue';
import { TestData } from '../data/mock-data';
import VueRouter from 'vue-router';
import RaidenService from '@/services/raiden-service';
import { emptyTokenModel } from '@/model/types';
import Mocked = jest.Mocked;

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.use(VueRouter);

const localVue = createLocalVue();
localVue.use(Vuetify);

describe('Tokens.vue', function() {
  addElemWithDataAppToBody();

  let wrapper: Wrapper<Tokens>;
  let mockRouter: VueRouter;
  let raiden: Mocked<RaidenService>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    raiden = new RaidenService(store) as Mocked<RaidenService>;
    vuetify = new Vuetify();

    mockRouter = new VueRouter({
      routes: [
        {
          path: '/connect',
          name: 'connect'
        }
      ]
    });
    const tokenModel = emptyTokenModel();
    tokenModel.open = 2;
    tokenModel.address = TestData.openChannel.token;
    const getters = {
      tokens: jest.fn().mockReturnValue([tokenModel])
    };

    wrapper = mount(Tokens, {
      localVue,
      vuetify,
      store: new Store({
        getters
      }),
      propsData: {
        current: 0,
        steps: []
      },
      router: mockRouter,
      mocks: {
        $raiden: raiden,
        $identicon: $identicon(),
        $t: (msg: string) => msg
      },
      stubs: {
        ConfirmationDialog: `
        <div>
            <button id="confirm" @click="$emit('confirm')"></button>
            <button id="cancel" @click="$emit('cancel')"></button>
        </div>`
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should display one connection entry', function() {
    const connections = wrapper.findAll('.connected-tokens__tokens__token');
    expect(connections.exists()).toBeTruthy();
    expect(connections.length).toBe(1);
  });

  it('should close the channel when confirmed', function() {
    raiden.leaveNetwork = jest.fn().mockReturnValue(null);
    expect(wrapper.vm.$data.leaveModalVisible).toBe(false);
    wrapper.find('#token-0').trigger('click');
    wrapper.find('#leave-0').trigger('click');
    expect(wrapper.vm.$data.leaveModalVisible).toBe(true);
    wrapper.find('#confirm').trigger('click');
    expect(wrapper.vm.$data.leaveModalVisible).toBe(false);
    expect(raiden.leaveNetwork).toHaveBeenCalledTimes(1);
    expect(raiden.leaveNetwork).toHaveBeenCalledWith(
      TestData.openChannel.token
    );
  });

  it('should dismiss the dialog when cancel is pressed', function() {
    raiden.leaveNetwork = jest.fn().mockReturnValue(null);
    wrapper.find('#token-0').trigger('click');
    wrapper.find('#leave-0').trigger('click');
    expect(wrapper.vm.$data.leaveModalVisible).toBe(true);
    wrapper.find('#cancel').trigger('click');
    expect(wrapper.vm.$data.leaveModalVisible).toBe(false);
    expect(raiden.leaveNetwork).toHaveBeenCalledTimes(0);
  });
});
