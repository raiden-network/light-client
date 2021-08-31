import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { VCardTitle } from 'vuetify/lib';

import ChannelDepositAction from '@/components/channels/ChannelDepositAction.vue';
import ChannelDepositDialog from '@/components/channels/ChannelDepositDialog.vue';

import { generateChannel, generateToken } from '../../utils/data-generator';

Vue.use(Vuetify);

const vuetify = new Vuetify();
const token = generateToken();
const channel = generateChannel();

function createWrapper(): Wrapper<ChannelDepositDialog> {
  return shallowMount(ChannelDepositDialog, {
    vuetify,
    mocks: { $t },
    propsData: {
      tokenAddress: token.address,
      partnerAddress: channel.partner,
    },
  });
}

describe('ChannelDepositDialog.vue', () => {
  test('displays title', async () => {
    const wrapper = createWrapper();
    const title = wrapper.findComponent(VCardTitle);

    expect(title.exists()).toBeTruthy();
    expect(title.text()).toContain('channel-deposit.title');
  });

  test('displays channel deposit action', async () => {
    const wrapper = createWrapper();
    const action = wrapper.findComponent(ChannelDepositAction);

    expect(action.exists()).toBeTruthy();
  });
});
