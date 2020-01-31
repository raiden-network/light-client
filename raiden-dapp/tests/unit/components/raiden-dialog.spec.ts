import { mount, Wrapper } from '@vue/test-utils';
import Vuetify from 'vuetify';
import Vue from 'vue';
import RaidenDialog from '@/components/RaidenDialog.vue';

Vue.use(Vuetify);

describe('RaidenDialog.vue', () => {
  let wrapper: Wrapper<RaidenDialog>;
  let vuetify: typeof Vuetify;

  beforeAll(() => {
    vuetify = new Vuetify();
    wrapper = mount(RaidenDialog, {
      attachToDocument: true,
      vuetify,
      propsData: {
        visible: true
      }
    });
  });

  test('emit a close event when the user presses close', () => {
    wrapper
      .findAll('button')
      .at(0)
      .trigger('click');
    expect(wrapper.emitted().close).toBeTruthy();
  });
});
