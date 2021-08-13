import { $t } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import AddressDisplay from '@/components/AddressDisplay.vue';
import Filters from '@/filters';

Vue.use(Vuetify);
Vue.filter('truncate', Filters.truncate);

const vuetify = new Vuetify();

function createWrapper(options?: { address?: string; label?: string }): Wrapper<AddressDisplay> {
  return mount(AddressDisplay, {
    vuetify,
    propsData: {
      address: options?.address ?? '0x31aA9D3E2bd38d22CA3Ae9be7aae1D518fe46043',
      label: options?.label,
    },
    mocks: { $t },
  });
}

describe('AddressDisplay.vue', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  test('displays label if propery is set', () => {
    const wrapper = createWrapper({ label: 'test label' });

    expect(wrapper.text()).toContain('test label');
  });

  test('copy the address to the clipboard when the user clicks on the address', async () => {
    const wrapper = createWrapper();
    const copied = jest.spyOn(wrapper.vm.$data, 'copied', 'set');
    document.execCommand = jest.fn();

    wrapper.find('.address__label').trigger('click');
    wrapper.find('.address__label').trigger('click');
    await wrapper.vm.$nextTick();
    jest.runAllTimers();

    expect(copied).toBeCalledTimes(3);
    expect(document.execCommand).toBeCalledTimes(2);
    expect(document.execCommand).toBeCalledWith('copy');
  });
});
