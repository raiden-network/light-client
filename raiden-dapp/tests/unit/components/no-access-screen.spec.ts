import { mount } from '@vue/test-utils';
import NoAccessScreen from '@/components/NoAccessScreen.vue';
import { DeniedReason } from '@/model/types';
import Vuetify from 'vuetify';
import Vue from 'vue';

Vue.use(Vuetify);

describe('NoAccessScreen.vue', () => {
  function createWrapper(reason: DeniedReason) {
    return mount(NoAccessScreen, {
      propsData: {
        reason: reason
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
    ).toEqual('The selected network is not supported');
  });

  test('user denied', () => {
    const wrapper = createWrapper(DeniedReason.USER_DENIED);
    expect(
      wrapper
        .find('span')
        .text()
        .trim()
    ).toEqual('Access was denied by the user');
  });
});
