import { mount, Wrapper } from '@vue/test-utils';
import AppHeader from '@/components/AppHeader.vue';
import store from '@/store/index';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { TestData } from '../data/mock-data';
import flushPromises from 'flush-promises';
import Filters from '@/filters';
import { addElemWithDataAppToBody } from '../utils/dialog';
import { $identicon } from '../utils/mocks';

Vue.use(Vuetify);
Vue.filter('displayFormat', Filters.displayFormat);

describe('AppHeader.vue', () => {
  addElemWithDataAppToBody();

  let wrapper: Wrapper<AppHeader>;

  beforeAll(() => {
    jest.useFakeTimers();
    wrapper = mount(AppHeader, {
      store: store,
      mocks: {
        $route: TestData.mockRoute(
          {},
          {
            title: 'Home'
          }
        ),
        $identicon: $identicon(),
        $t: (msg: string) => msg
      }
    });
  });

  test('copy the address to the clipboard when the user presses the copy button', async () => {
    const copied = jest.spyOn(wrapper.vm.$data, 'copied', 'set');
    store.commit('loadComplete');
    store.commit('account', '0xaccc');
    await wrapper.vm.$nextTick();
    document.execCommand = jest.fn();
    wrapper.find('button').trigger('click');
    wrapper.find('button').trigger('click');

    await flushPromises();
    jest.runAllTimers();
    expect(copied).toBeCalledTimes(3);
    expect(document.execCommand).toBeCalledTimes(2);
    expect(document.execCommand).toBeCalledWith('copy');
  });
});
