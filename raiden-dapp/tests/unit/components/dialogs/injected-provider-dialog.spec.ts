/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';

import ActionButton from '@/components/ActionButton.vue';
import InjectedProviderDialog from '@/components/dialogs/InjectedProviderDialog.vue';
import { InjectedProvider } from '@/services/ethereum-provider';

jest.mock('@/services/ethereum-provider/injected-provider');

Vue.use(Vuetify);

const vuetify = new Vuetify();

function createWrapper(): Wrapper<InjectedProviderDialog> {
  return mount(InjectedProviderDialog, {
    vuetify,
    stubs: { 'action-button': ActionButton },
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

    await clickLinkButton(wrapper);

    expect(InjectedProvider.link).toHaveBeenCalledTimes(1);
  });

  test('successful link emits linked provider instance', async () => {
    const wrapper = createWrapper();

    await clickLinkButton(wrapper);

    expect(wrapper.emitted().linkEstablished?.length).toBe(1);
  });

  test('shows error when linking fails', async () => {
    const wrapper = createWrapper();
    let errorMessage = wrapper.find('.injected-provider__error-message');
    expect(errorMessage.exists()).toBeFalsy();

    (InjectedProvider as any).link.mockRejectedValueOnce(new Error('canceled'));
    await clickLinkButton(wrapper);

    errorMessage = wrapper.find('.injected-provider__error-message');
    expect(errorMessage.exists()).toBeTruthy();
    expect(errorMessage.text()).toMatch(
      'connection-manager.dialogs.injected-provider.error-message',
    );
  });

  test('linking again after error hides error message', async () => {
    const wrapper = createWrapper();

    (InjectedProvider as any).link.mockRejectedValueOnce(new Error('canceled'));
    await clickLinkButton(wrapper);

    let errorMessage = wrapper.find('.injected-provider__error-message');
    expect(errorMessage.exists()).toBeTruthy();

    // Failing mock was only **once**.
    await clickLinkButton(wrapper);

    errorMessage = wrapper.find('.injected-provider__error-message');
    expect(errorMessage.exists()).toBeFalsy();
  });
});
