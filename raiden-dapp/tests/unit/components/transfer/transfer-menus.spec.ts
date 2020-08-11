jest.mock('vue-router');
import Mocked = jest.Mocked;
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import store from '@/store';
import VueRouter from 'vue-router';
import { RouteNames } from '@/router/route-names';
import Vuetify from 'vuetify';
import TransferMenus from '@/components/transfer/TransferMenus.vue';
import { BigNumber } from 'ethers/utils';
import { One, Zero } from 'ethers/constants';
import { generateToken } from '../../utils/data-generator';

Vue.use(Vuetify);

describe('TransferMenus.vue', () => {
  const vuetify = new Vuetify();
  let router: Mocked<VueRouter>;
  const token = generateToken();

  const createWrapper = (capacity: BigNumber): Wrapper<TransferMenus> => {
    router = new VueRouter() as Mocked<VueRouter>;

    return mount(TransferMenus, {
      vuetify,
      store,
      stubs: ['v-menu', 'v-dialog'],
      mocks: {
        $router: router,
        $t: (msg: string) => msg,
      },
      propsData: {
        token,
        capacity,
      },
    });
  };

  test('displays "no open channels" if channel capacity is zero', () => {
    const wrapper = createWrapper(Zero);
    const amountDisplay = wrapper.findAll('span').at(3);

    expect(amountDisplay.text()).toContain(
      'transfer.transfer-menus.no-channels'
    );
  });

  test('disables deposit button if channel capacity is zero', () => {
    const wrapper = createWrapper(Zero);
    const depositButton = wrapper.find(
      '.transfer-menus__deposit-channels__menu--deposit'
    );

    expect(depositButton.attributes()['disabled']).toBe('disabled');
  });

  test('displays amount if channel has capacity', () => {
    const wrapper = createWrapper(One);
    const amountDisplay = wrapper.findAll('span').at(3);

    expect(amountDisplay.find('div').text()).toContain('0.000001');
  });

  test('deposit button is enabled if channel has capacity', () => {
    const wrapper = createWrapper(One);
    const depositButton = wrapper.find(
      '.transfer-menus__deposit-channels__menu--deposit'
    );

    expect(depositButton.attributes()).not.toMatchObject(
      expect.objectContaining({ disabled: 'disabled' })
    );
  });

  test('deposit button opens deposit dialog', async () => {
    const wrapper = createWrapper(One);
    const depositButton = wrapper.find(
      '.transfer-menus__deposit-channels__menu--deposit'
    );

    depositButton.trigger('click');
    await wrapper.vm.$nextTick();

    const channelDepositDialog = wrapper.find('.channel-deposit');

    expect(channelDepositDialog.exists()).toBe(true);
  });

  test('clicking change token button displays token overlay', async () => {
    const wrapper = createWrapper(One);
    const tokenSelectButton = wrapper.findAll('span').at(0);

    tokenSelectButton.trigger('click');
    await wrapper.vm.$nextTick();

    const tokenOverlay = wrapper.find('.v-overlay--active');
    expect(tokenOverlay.exists()).toBe(true);
  });

  test('clicking channels button navigates to channels screen', async () => {
    router.push = jest.fn().mockImplementation(() => Promise.resolve());

    const wrapper = createWrapper(One);
    const channelsButton = wrapper.find(
      '.transfer-menus__deposit-channels__menu--channels'
    );

    channelsButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.CHANNELS,
      })
    );

    console.log(wrapper.html());
  });
});
