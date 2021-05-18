import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import ActionButton from '@/components/ActionButton.vue';
import EthereumProviderBaseDialog from '@/components/dialogs/EthereumProviderBaseDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';

Vue.use(Vuetify);

const vuetify = new Vuetify();

function createWrapper(options?: {
  header?: string;
  description?: string;
  canLink?: boolean;
  linkingInProgress?: boolean;
  linkingFailed?: boolean;
  errorMessage?: string;
}): Wrapper<EthereumProviderBaseDialog> {
  return mount(EthereumProviderBaseDialog, {
    vuetify,
    propsData: {
      header: options?.header ?? 'header',
      description: options?.description,
      canLink: options?.canLink ?? true,
      linkingInProgress: options?.linkingInProgress ?? false,
      linkingFailed: options?.linkingFailed ?? false,
      errorMessage: options?.errorMessage ?? 'error',
    },
    stubs: { 'v-dialog': true },
    mocks: { $t },
  });
}

describe('EthereumProviderBaseDialog.vue', () => {
  test('shows header', () => {
    const wrapper = createWrapper({ header: 'testHeader' });
    const header = wrapper.find('.ethereum-provider-base-dialog__header');

    expect(header.isVisible()).toBeTruthy();
    expect(header.text()).toMatch('testHeader');
  });

  test('shows description it given', () => {
    const wrapper = createWrapper({ description: 'testDescription' });
    const description = wrapper.find('.ethereum-provider-base-dialog__description');

    expect(description.isVisible()).toBeTruthy();
    expect(description.text()).toMatch('testDescription');
  });

  test('shows spinner if in progress', () => {
    const wrapper = createWrapper({ linkingInProgress: true });
    const spinner = wrapper.findComponent(Spinner);

    expect(spinner.isVisible()).toBeTruthy();
  });

  test('shows given error message when linking failed', () => {
    const wrapper = createWrapper({ linkingFailed: true, errorMessage: 'failed' });
    const error = wrapper.find('.ethereum-provider-base-dialog__error');

    expect(error.isVisible()).toBeTruthy();
    expect(error.text()).toMatch('failed');
  });

  test('shows button to link', () => {
    const wrapper = createWrapper({ linkingInProgress: true });
    const button = wrapper.findComponent(ActionButton).find('button');

    expect(button.isVisible()).toBeTruthy();
    expect(button.text()).toBe('connection-manager.dialogs.base.link-button');
  });

  test('button is disabled when linking in progress', () => {
    const wrapper = createWrapper({ linkingInProgress: true });
    const button = wrapper.findComponent(ActionButton).find('button');

    expect(button.attributes('disabled')).toBeTruthy();
  });

  test('button is disabled when linking not possible', () => {
    const wrapper = createWrapper({ canLink: false });
    const button = wrapper.findComponent(ActionButton).find('button');

    expect(button.attributes('disabled')).toBeTruthy();
  });

  test('button is enabled when linking possible and not in progress', () => {
    const wrapper = createWrapper({ canLink: true, linkingInProgress: false });
    const button = wrapper.findComponent(ActionButton).find('button');

    expect(button.attributes('disabled')).toBeFalsy();
  });

  test('button emits link event on click', () => {
    const wrapper = createWrapper();
    const button = wrapper.findComponent(ActionButton).find('button');
    expect(wrapper.emitted('link')).toBeUndefined();

    button.trigger('click');

    expect(wrapper.emitted('link')?.length).toBe(1);
  });
});
