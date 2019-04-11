import { mockInput } from '../utils/interaction-utils';

jest.mock('@/services/raiden-service');
jest.mock('vue-router');
jest.useFakeTimers();

import VueRouter from 'vue-router';
import flushPromises from 'flush-promises';
import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import Deposit from '@/components/Deposit.vue';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { TestData } from '../data/mock-data';
import RaidenService, {
  DepositFailed,
  OpenChannelFailed
} from '@/services/raiden-service';
import store from '@/store';
import Mocked = jest.Mocked;

Vue.use(Vuetify);

describe('Deposit.vue', function() {
  let service: Mocked<RaidenService>;
  let wrapper: Wrapper<Deposit>;
  let button: Wrapper<Vue>;
  let router: Mocked<VueRouter>;

  beforeAll(async () => {
    service = new RaidenService(store) as Mocked<RaidenService>;
    router = new VueRouter() as Mocked<VueRouter>;
    const localVue = createLocalVue();
    wrapper = mount(Deposit, {
      localVue,
      propsData: {
        token: '0xtoken',
        partner: '0xpartner',
        tokenInfo: TestData.token
      },
      mocks: {
        $raiden: service,
        $router: router
      }
    });
    button = wrapper.find('#open-channel');
    await wrapper.vm.$nextTick();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should not be disabled after load', async function() {
    const button = wrapper.find('#open-channel');
    await flushPromises();
    expect(button.element.getAttribute('disabled')).toBeFalsy();
  });

  it('should show an error if channel opening failed', async function() {
    service.openChannel = jest.fn().mockRejectedValue(new OpenChannelFailed());
    button.trigger('click');
    const deposit = wrapper.vm;
    await flushPromises();
    expect(deposit.$data.snackbar).toBe(true);
    expect(deposit.$data.error).toBe('Channel open failed.');
  });

  it('should had an error if deposit failed', async function() {
    service.openChannel = jest.fn().mockRejectedValue(new DepositFailed());
    mockInput(wrapper, '0.0001');
    button.trigger('click');
    const deposit = wrapper.vm;
    await flushPromises();
    expect(deposit.$data.snackbar).toBe(true);
    expect(deposit.$data.error).toBe('Could not deposit to the channel.');
  });

  it('should navigate to send on success', async function() {
    const deposit = wrapper.vm;
    const loading = jest.spyOn(deposit.$data, 'loading', 'set');
    router.push = jest.fn().mockResolvedValue(null);
    service.openChannel = jest.fn().mockResolvedValue(true);
    button.trigger('click');
    await flushPromises();
    jest.runAllTimers();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(loading).toHaveBeenCalledTimes(2);
  });
});
