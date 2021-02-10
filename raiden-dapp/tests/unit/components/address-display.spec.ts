import { $identicon } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import AddressDisplay from '@/components/AddressDisplay.vue';
import Filters from '@/filters';

import { TestData } from '../data/mock-data';

Vue.use(Vuetify);
Vue.filter('truncate', Filters.truncate);

describe('AddressDisplay.vue', () => {
  let wrapper: Wrapper<AddressDisplay>;
  let vuetify: Vuetify;

  beforeAll(() => {
    jest.useFakeTimers();
    vuetify = new Vuetify();
    wrapper = mount(AddressDisplay, {
      vuetify,
      propsData: { address: '0x31aA9D3E2bd38d22CA3Ae9be7aae1D518fe46043' },
      mocks: {
        $route: TestData.mockRoute(
          {},
          {
            title: 'Home',
          },
        ),
        $identicon: $identicon(),
        $t: (msg: string) => msg,
      },
    });
  });

  test('copy the address to the clipboard when the user clicks on the address', async () => {
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
