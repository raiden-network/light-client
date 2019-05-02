jest.mock('@/services/raiden-service');
jest.mock('vue-router');
jest.useFakeTimers();

import { Store } from 'vuex';
import VueRouter from 'vue-router';
import { mockInput } from '../utils/interaction-utils';
import flushPromises from 'flush-promises';
import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import Deposit from '@/views/Deposit.vue';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { TestData } from '../data/mock-data';
import RaidenService, {
  ChannelDepositFailed,
  ChannelOpenFailed
} from '@/services/raiden-service';
import store from '@/store';
import Mocked = jest.Mocked;
import NavigationMixin from '@/mixins/navigation-mixin';

Vue.use(Vuetify);

describe('Deposit.vue', function() {
  let service: Mocked<RaidenService>;
  let wrapper: Wrapper<Deposit>;
  let button: Wrapper<Vue>;
  let router: Mocked<VueRouter>;

  beforeAll(async () => {
    service = new RaidenService(store) as Mocked<RaidenService>;
    router = new VueRouter() as Mocked<VueRouter>;
    router.currentRoute = {
      path: '',
      fullPath: '',
      matched: [],
      hash: '',
      params: {
        token: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
        partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b'
      },
      query: {}
    };

    const getters = {
      token: jest.fn().mockReturnValue(TestData.token)
    };
    const localVue = createLocalVue();
    wrapper = mount(Deposit, {
      localVue,
      store: new Store({
        getters
      }),
      propsData: {
        current: 0
      },
      mixins: [NavigationMixin],
      mocks: {
        $raiden: service,
        $router: router
      }
    });
    await flushPromises();
    button = wrapper.find('#open-channel');
    await wrapper.vm.$nextTick();
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  it('should not be disabled after load', async function() {
    const button = wrapper.find('#open-channel');
    await flushPromises();
    expect(button.element.getAttribute('disabled')).toBeFalsy();
  });

  it('should show an error if channel opening failed', async function() {
    service.openChannel = jest.fn().mockRejectedValue(new ChannelOpenFailed());
    button.trigger('click');
    const deposit = wrapper.vm;
    await flushPromises();
    expect(deposit.$data.snackbar).toBe(true);
    expect(deposit.$data.error).toBe('Channel open failed.');
  });

  it('should had an error if deposit failed', async function() {
    service.openChannel = jest
      .fn()
      .mockRejectedValue(new ChannelDepositFailed());
    mockInput(wrapper, '0.0001');
    button.trigger('click');
    const deposit = wrapper.vm;
    await flushPromises();
    expect(deposit.$data.snackbar).toBe(true);
    expect(deposit.$data.error).toBe('Could not deposit to the channel.');
  });

  it('should show an error if any error happens during channel opening', async function() {
    service.openChannel = jest.fn().mockRejectedValue(new Error('unknown'));
    mockInput(wrapper, '0.0001');
    button.trigger('click');
    const deposit = wrapper.vm;
    await flushPromises();
    expect(deposit.$data.snackbar).toBe(true);
    expect(deposit.$data.error).toBe('unknown');
  });

  it('should navigate to send on success', async function() {
    const deposit = wrapper.vm;
    const loading = jest.spyOn(deposit.$data, 'loading', 'set');
    router.push = jest.fn().mockResolvedValue(null);
    service.openChannel = jest.fn().mockResolvedValue(null);
    button.trigger('click');
    await flushPromises();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(loading).toHaveBeenCalledTimes(2);
  });
});
