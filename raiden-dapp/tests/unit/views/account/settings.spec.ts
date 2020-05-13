import Settings from '@/views/account/Settings.vue';

jest.mock('vue-router');
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import store from '@/store';

Vue.use(Vuetify);

describe('Settings.vue', () => {
  let wrapper: Wrapper<Settings>;
  let vuetify: typeof Vuetify;
  beforeEach(async () => {
    vuetify = new Vuetify();
    wrapper = mount(Settings, {
      vuetify,
      store,
      mocks: {
        $t: (msg: string) => msg
      }
    });

    await wrapper.vm.$nextTick();
  });

  test('toggling "use raiden account" updates setting state', async () => {
    const toggleInput = wrapper.find('input');

    store.commit('updateSettings', { useRaidenAccount: true });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('settings.raiden-account.title');

    toggleInput.trigger('click');
    await wrapper.vm.$nextTick();

    expect((toggleInput.element as HTMLInputElement).checked).toBe(false);
    expect(store.state.settings.useRaidenAccount).toBe(false);
  });
});
