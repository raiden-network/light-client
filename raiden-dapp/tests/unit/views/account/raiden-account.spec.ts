jest.useFakeTimers();
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import flushPromises from 'flush-promises';

import store from '@/store';
import RaidenAccount from '@/views/account/RaidenAccount.vue';

Vue.use(Vuetify);

describe('RaidenAccount.vue', () => {
  let wrapper: Wrapper<RaidenAccount>;
  let vuetify: typeof Vuetify;
  let $raiden = {
    transferToRaidenAccount: jest.fn(),
    transferToMainAccount: jest.fn(),
    getMainAccount: jest.fn().mockResolvedValue('0x1'),
    getAccount: jest.fn().mockResolvedValue('0x2')
  };
  beforeEach(async () => {
    vuetify = new Vuetify();

    wrapper = mount(RaidenAccount, {
      vuetify,
      stubs: ['v-dialog'],
      mocks: {
        $t: (msg: string) => msg,
        $raiden
      },
      store
    });

    store.commit('balance', '3.0');
    store.commit('raidenAccountBalance', '2.0');

    wrapper.vm.$nextTick();
    await flushPromises();

    jest.resetAllMocks();
  });

  test('initially displays from main to raiden account', () => {
    const cols = wrapper.findAll('.raiden-account__column');
    expect(cols.at(0).text()).toContain('general.main-account');
    expect(cols.at(2).text()).toContain('general.raiden-account');
  });

  test('sends from main to raiden account', async () => {
    const btn = wrapper.find('.action-button__button');
    expect(wrapper.vm.$data.amount).toEqual('3.0');
    expect(btn.attributes()['disabled']).toBeUndefined();

    wrapper.find('form').trigger('submit');
    wrapper.vm.$nextTick();
    await flushPromises();
    expect(wrapper.vm.$data.isFromMainToRaidenAccount).toBe(true);
    expect($raiden.transferToRaidenAccount).toHaveBeenCalled();
  });

  test('switch button swaps direction and amount', async () => {
    // Switch direction
    wrapper.find('button').trigger('click');
    await wrapper.vm.$nextTick();

    const cols = wrapper.findAll('.raiden-account__column');
    expect(cols.at(0).text()).toContain('general.raiden-account');
    expect(cols.at(2).text()).toContain('general.main-account');
    expect(wrapper.vm.$data.isFromMainToRaidenAccount).toBe(false);
    expect(wrapper.vm.$data.amount).toEqual('2.0');
  });

  test('sends from raiden to main account', async () => {
    // Switch direction
    wrapper.find('button').trigger('click');
    await wrapper.vm.$nextTick();

    const btn = wrapper.find('.action-button__button');
    expect(btn.attributes()['disabled']).toBeUndefined();

    wrapper.find('form').trigger('submit');
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(wrapper.vm.$data.isFromMainToRaidenAccount).toBe(false);
    expect($raiden.transferToMainAccount).toHaveBeenCalled();
  });
});
