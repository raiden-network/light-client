import Vue from 'vue';
import Vuex, { Store } from 'vuex';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import TokenNetworks from '@/components/TokenNetworks.vue';
import { TestData } from '../data/mock-data';
import VueRouter from 'vue-router';

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.use(VueRouter);

describe('TokenNetworks.vue', function() {
  let wrapper: Wrapper<TokenNetworks>;
  let mockRouter: VueRouter;

  beforeEach(() => {
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
      stubs: {
        ConfirmationDialog: `
        <div>
            <button id="confirm" @click="$emit('confirm')"></button>
            <button id="cancel" @click="$emit('cancel')"></button>
        </div>`
      }
    });
  });

  it('should display one connection entry', function() {
    const connections = wrapper.findAll('.connection');
    expect(connections.exists()).toBeTruthy();
    expect(connections.length).toBe(1);
  });
});
