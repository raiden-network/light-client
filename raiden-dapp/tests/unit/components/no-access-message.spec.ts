import { mount } from '@vue/test-utils';
import NoAccessMessage from '@/components/NoAccessMessage.vue';
import { DeniedReason } from '@/model/types';
import Vuetify from 'vuetify';
import Vue from 'vue';

Vue.use(Vuetify);

describe('NoAccessScreen.vue', () => {
  function createWrapper(reason: DeniedReason) {
    return mount(NoAccessMessage, {
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
    ).toEqual('The current network is unsupported.');
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
    ).toEqual(
      'A valid account could not be detected. Please make sure that your provider is unlocked and accessible.'
    );
  });
});
