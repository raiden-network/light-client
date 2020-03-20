jest.mock('vue-router');
import Mocked = jest.Mocked;
import { mount, Wrapper } from '@vue/test-utils';
import { TestData } from '../data/mock-data';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import GeneralDialog from '@/views/GeneralDialog.vue';

Vue.use(Vuetify);

describe('GeneralDialog.vue', () => {
  let wrapper: Wrapper<GeneralDialog>;
  let router: Mocked<VueRouter>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;

    wrapper = mount(GeneralDialog, {
      vuetify,
      stubs: ['router-view'],
      mocks: {
        $router: router,
        $route: TestData.mockRoute()
      }
    });
  });

  test('go to previously visited route when back arrow is clicked', () => {
    const button = wrapper.find('button');
    button.trigger('click');

    expect(router.go).toHaveBeenCalledTimes(1);
    expect(router.go).toHaveBeenCalledWith(-1);
  });
});
