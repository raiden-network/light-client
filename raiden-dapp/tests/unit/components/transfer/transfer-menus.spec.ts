import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import TransferMenus from '@/components/transfer/TransferMenus.vue';
import { BigNumber } from 'ethers/utils';
import { One, Zero } from 'ethers/constants';
import { generateToken } from '../../utils/data-generator';

Vue.use(Vuetify);

describe('TransferMenus.vue', () => {
  const vuetify = new Vuetify();
  const token = generateToken();

  const createWrapper = (capacity: BigNumber): Wrapper<TransferMenus> => {
    return mount(TransferMenus, {
      vuetify,
      stubs: ['v-menu'],
      mocks: {
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

  test('deposits successfully', async () => {});
});
