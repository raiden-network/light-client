import { mount } from '@vue/test-utils';
import NoAccessMessage from '@/components/NoAccessMessage.vue';
import { DeniedReason } from '@/model/types';
import Vuetify from 'vuetify';
import Vue from 'vue';

Vue.use(Vuetify);

describe('NoAccessScreen.vue', () => {
  let vuetify: typeof Vuetify;

  function createWrapper(reason: DeniedReason) {
    vuetify = new Vuetify();
    return mount(NoAccessMessage, {
      vuetify,
      propsData: {
        reason: reason
      },
      mocks: {
        $t: (msg: string) => msg
      }
    });
  }

  test('unsupported network', () => {
    const wrapper = createWrapper(DeniedReason.UNSUPPORTED_NETWORK);
    expect(
      wrapper
        .find('span')
        .text()
        .trim()
    ).toEqual('no-access.unsupported-network');
  });

  test('user denied', () => {
    const wrapper = createWrapper(DeniedReason.NO_ACCOUNT);
    expect(
      wrapper
        .find('span')
        .text()
        .trim()
        .split('\n')
        .map(text => text.trim())
        .join(' ')
    ).toEqual('no-access.generic-error');
  });

  test('sdk error', () => {
    const wrapper = createWrapper(DeniedReason.INITIALIZATION_FAILED);
    expect(
      wrapper
        .find('span')
        .text()
        .trim()
        .split('\n')
        .map(text => text.trim())
        .join(' ')
    ).toEqual('no-access.sdk-initialization-failure');
  });
});
