import { mount, Wrapper } from '@vue/test-utils';
import Vuetify from 'vuetify';
import Vue from 'vue';

import store from '@/store';
import ConnectDialog from '@/components/dialogs/ConnectDialog.vue';

Vue.use(Vuetify);

describe('ConnectDialog.vue', () => {
  let wrapper: Wrapper<ConnectDialog>;
  let vuetify: typeof Vuetify;

  beforeAll(() => {
    window.web3 = true;
    window.ethereum = true;
  });

  beforeEach(async () => {
    vuetify = new Vuetify();
    wrapper = mount(ConnectDialog, {
      vuetify,
      store,
      stubs: ['v-dialog'],
      propsData: {
        connecting: false,
        visible: true,
        hasProvider: true
      },
      mocks: {
        $t: (msg: string) => msg
      }
    });
  });

  test('sets raiden account in settings when clicked connect', async () => {
    wrapper.find('.action-button__button').trigger('click');
    await wrapper.vm.$nextTick();
    expect(store.state.settings.useRaidenAccount).toBe(true);
  });
});
