jest.mock('vue-router');
import Mocked = jest.Mocked;
import { mockInput } from '../../utils/interaction-utils';
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import store from '@/store';
import VueRouter from 'vue-router';
import { RouteNames } from '@/router/route-names';
import Vuetify from 'vuetify';
import TransferInputs from '@/components/transfer/TransferInputs.vue';
import { TestData } from '../../data/mock-data';
import { constants } from 'ethers';
import { generateToken } from '../../utils/data-generator';

Vue.use(Vuetify);

describe('TransferInputs.vue', () => {
  const vuetify = new Vuetify();
  const router = new VueRouter() as Mocked<VueRouter>;
  const token = generateToken();

  router.push = jest.fn().mockImplementation(() => Promise.resolve());

  const wrapper: Wrapper<TransferInputs> = mount(TransferInputs, {
    vuetify,
    store,
    mocks: {
      $router: router,
      $route: TestData.mockRoute({
        token
      }),
      $t: (msg: string) => msg
    },
    propsData: {
      token,
      capacity: constants.One
    }
  });

  test('navigates to transfer steps if target and amount is valid', async () => {
    const addressInput = wrapper.findAll('input').at(0);
    const amountInput = wrapper.findAll('input').at(1);

    mockInput(addressInput, '0x32bBc8ba52FB6F61C24809FdeDA1baa5E55e55EA');
    await wrapper.vm.$nextTick();
    mockInput(amountInput, '0.01');
    await wrapper.vm.$nextTick();

    wrapper.setData({
      valid: true
    });
    await wrapper.vm.$nextTick();

    const button = wrapper.find('button');
    expect(button.attributes()['disabled']).toBeUndefined();

    wrapper.find('form').trigger('submit');
    await wrapper.vm.$nextTick();

    expect(router.push).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: RouteNames.TRANSFER_STEPS })
    );
  });
});
