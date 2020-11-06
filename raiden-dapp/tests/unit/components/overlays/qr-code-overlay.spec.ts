import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import QrCodeOverlay from '@/components/overlays/QrCodeOverlay.vue';

Vue.use(Vuetify);

describe('QrCodeOverlay.vue', () => {
  let wrapper: Wrapper<QrCodeOverlay>;
  let vuetify: Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(QrCodeOverlay, {
      vuetify,
      mocks: {
        $t: (msg: string) => msg,
      },
      stubs: ['qrcode-stream'],
      propsData: {
        visible: true,
      },
    });
  });

  test('render', () => {
    expect(wrapper.find('.v-overlay--active').exists()).toBe(true);
  });

  test('shows error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wrapper.vm as any).onInit(Promise.reject(new Error()));
    expect(wrapper.find('.error-message').exists()).toBe(true);
  });
});
