import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';

import ActionButton from '@/components/ActionButton.vue';
import InjectedProviderDialog from '@/components/dialogs/InjectedProviderDialog.vue';
import { InjectedProvider } from '@/services/ethereum-provider/injected-provider';

jest.mock('@/mixins/ethereum-provider-dialog-mixin');
jest.mock('@/services/ethereum-provider/injected-provider');

Vue.use(Vuetify);

const vuetify = new Vuetify();

function createWrapper(): Wrapper<InjectedProviderDialog> {
  return mount(InjectedProviderDialog, {
    vuetify,
    stubs: { 'v-dialog': true, 'action-button': ActionButton },
    mocks: { $t },
  });
}

async function clickLinkButton(wrapper: Wrapper<InjectedProviderDialog>): Promise<void> {
  const button = wrapper.findComponent(ActionButton).get('button');
  button.trigger('click');
  await flushPromises();
}

describe('InjectedProviderDialog.vue', () => {
  test('can link', async () => {
    const wrapper = createWrapper();
    expect(wrapper.emitted('linkEstablished')).toBeUndefined();

    await clickLinkButton(wrapper);

    expect(InjectedProvider.link).toHaveBeenCalledTimes(1);
    expect(InjectedProvider.link).toHaveBeenCalledWith({});
    expect(wrapper.emitted('linkEstablished')?.length).toBe(1);
    expect(wrapper.emitted('linkEstablished')?.[0][0]).toBeInstanceOf(InjectedProvider);
  });
});
