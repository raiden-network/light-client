jest.mock('@/services/raiden-service');

import store from '@/store';
import Vue from 'vue';
import Vuex, { Store } from 'vuex';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import TokenNetworks from '@/components/TokenNetworks.vue';
import { TestData } from '../data/mock-data';
import VueRouter from 'vue-router';
import RaidenService from '@/services/raiden-service';
import Mocked = jest.Mocked;

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.use(VueRouter);

describe('TokenNetworks.vue', function() {
  let wrapper: Wrapper<TokenNetworks>;
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
    const getters = {
      connections: jest.fn().mockReturnValue([TestData.mockChannel1])
    };

    wrapper = mount(TokenNetworks, {
      store: new Store({
        getters
      }),
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
    raiden.closeChannel = jest.fn().mockReturnValue(null);
    expect(wrapper.vm.$data.displayModal).toBe(false);
    wrapper.find('#close-278').trigger('click');
    expect(wrapper.vm.$data.displayModal).toBe(true);
    wrapper.find('#confirm').trigger('click');
    expect(wrapper.vm.$data.displayModal).toBe(false);
    expect(raiden.closeChannel).toHaveBeenCalledTimes(1);
    expect(raiden.closeChannel).toHaveBeenCalledWith(TestData.mockChannel1);
  });

  it('should dismiss the dialog when cancel is pressed', function() {
    raiden.closeChannel = jest.fn().mockReturnValue(null);
    wrapper.find('#close-278').trigger('click');
    expect(wrapper.vm.$data.displayModal).toBe(true);
    wrapper.find('#cancel').trigger('click');
    expect(wrapper.vm.$data.displayModal).toBe(false);
    expect(raiden.closeChannel).toHaveBeenCalledTimes(0);
  });
});
