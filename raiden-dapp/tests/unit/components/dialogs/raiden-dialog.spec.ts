import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';

Vue.use(Vuetify);

describe('RaidenDialog.vue', () => {
  let wrapper: Wrapper<RaidenDialog>;
  let vuetify: Vuetify;

  beforeAll(() => {
    vuetify = new Vuetify();
    wrapper = mount(RaidenDialog, {
      vuetify,
      stubs: ['v-dialog'],
      propsData: {
        visible: true,
      },
    });
  });

  test('emit a close event when the user presses close', () => {
    wrapper.find('button').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
