import { addElemWithDataAppToBody } from '../utils/dialog';
import store from '@/store';
import Vue from 'vue';
import Vuex, { Store } from 'vuex';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import Tokens from '@/components/Tokens.vue';
import { TestData } from '../data/mock-data';
import VueRouter from 'vue-router';
import RaidenService from '@/services/raiden-service';
import { createEmptyTokenModel } from '@/model/types';

jest.mock('@/services/raiden-service');

import Mocked = jest.Mocked;

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.use(VueRouter);

describe('Tokens.vue', function() {
  addElemWithDataAppToBody();

  let wrapper: Wrapper<Tokens>;
  let mockRouter: VueRouter;
  let raiden: Mocked<RaidenService>;

  beforeEach(() => {
    raiden = new RaidenService(store) as Mocked<RaidenService>;
    mockRouter = new VueRouter({
      routes: [
        {
          path: '/connect',
          name: 'connect'
        }
      ]
    });
    const tokenModel = createEmptyTokenModel();
    tokenModel.open = 2;
    tokenModel.address = TestData.openChannel.token;
    const getters = {
      tokens: jest.fn().mockReturnValue([tokenModel])
    };

    wrapper = mount(Tokens, {
      store: new Store({
        getters
      }),
      propsData: {
        current: 0,
        steps: []
      },
      router: mockRouter,
      mocks: {
        $raiden: raiden
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
    const connections = wrapper.findAll('.connection');
    expect(connections.exists()).toBeTruthy();
    expect(connections.length).toBe(1);
  });

  it('should close the channel when confirmed', function() {
    raiden.leaveNetwork = jest.fn().mockReturnValue(null);
    expect(wrapper.vm.$data.leaveModalVisible).toBe(false);
    wrapper.find('#overflow-0').trigger('click');
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
    wrapper.find('#overflow-0').trigger('click');
    wrapper.find('#leave-0').trigger('click');
    expect(wrapper.vm.$data.leaveModalVisible).toBe(true);
    wrapper.find('#cancel').trigger('click');
    expect(wrapper.vm.$data.leaveModalVisible).toBe(false);
    expect(raiden.leaveNetwork).toHaveBeenCalledTimes(0);
  });
});
