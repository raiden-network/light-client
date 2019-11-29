jest.mock('vue-router');

import Mocked = jest.Mocked;
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import VueRouter from 'vue-router';
import { RouteNames } from '@/router/route-names';
import NoTokens from '@/components/NoTokens.vue';

Vue.use(Vuetify);

describe('NoTokens.vue', () => {
  let wrapper: Wrapper<NoTokens>;
  let vuetify: typeof Vuetify;
  let mockedRouter: Mocked<VueRouter>;

  beforeAll(() => {
    vuetify = new Vuetify();
    mockedRouter = new VueRouter() as Mocked<VueRouter>;
    mockedRouter.push = jest.fn().mockResolvedValue(null);

    wrapper = mount(NoTokens, {
      vuetify,
      mocks: {
        $router: mockedRouter,
        $t: (msg: string) => msg
      }
    });
  });

  test('navigate to token select when the user presses the connect button', () => {
    wrapper.find('button').trigger('click');
    expect(mockedRouter.push).toHaveBeenCalledTimes(1);
    expect(mockedRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.SELECT_TOKEN
      })
    );
  });
});
