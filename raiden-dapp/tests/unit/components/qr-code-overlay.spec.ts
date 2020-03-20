import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import QrCodeOverlay from '@/components/QrCodeOverlay.vue';

Vue.use(Vuetify);

describe('QrCodeOverlay.vue', () => {
  let wrapper: Wrapper<QrCodeOverlay>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(QrCodeOverlay, {
      vuetify,
      mocks: {
        $t: (msg: string) => msg
      },
      stubs: ['qrcode-stream'],
      propsData: {
        visible: true
      }
    });
  });

  test('render', () => {
    expect(wrapper.find('.v-overlay--active').exists()).toBe(true);
  });

  test('shows error', async () => {
    // @ts-ignore
    await wrapper.vm.onInit(
      new Promise((_, __) => {
        throw new Error();
      })
    );
    expect(wrapper.find('.error-message').exists()).toBe(true);
  });
});
