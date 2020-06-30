jest.mock('@/services/raiden-service');
jest.mock('@/i18n', () => jest.fn());

import flushPromises from 'flush-promises';
import RaidenService from '@/services/raiden-service';
import store from '@/store';
import { One } from 'ethers/constants';
import { mount, Wrapper } from '@vue/test-utils';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { $identicon } from '../../utils/mocks';
import Mocked = jest.Mocked;
import UdcWithdrawalDialog from '@/components/dialogs/UdcWithdrawalDialog.vue';
import { parseEther } from 'ethers/utils';

Vue.use(Vuetify);
describe('UdcWithdrawalDialog.vue', function() {
  let wrapper: Wrapper<UdcWithdrawalDialog>;
  let $raiden: Mocked<RaidenService>;

  const token = {
    address: '0x3a989D97388a39A0B5796306C615d10B7416bE77',
    name: 'ServiceToken',
    symbol: 'SVT',
    decimals: 18,
    balance: One
  };
  function createWrapper() {
    const vuetify = new Vuetify();
    return mount(UdcWithdrawalDialog, {
      vuetify,
      store,
      stubs: ['v-dialog'],
      propsData: {
        visible: true,
        accountBalance: '0.23',
        token,
        capacity: parseEther('10')
      },
      mocks: {
        $identicon: $identicon(),
        $t: (msg: string) => msg,
        $raiden
      }
    });
  }

  beforeEach(() => {
    $raiden = new RaidenService(store) as Mocked<RaidenService>;
    wrapper = createWrapper();
    jest.resetAllMocks();
  });

  test('plan withdraw', async () => {
    expect.assertions(1);
    await (wrapper.vm as any).planWithdraw();
    await flushPromises();
    expect($raiden.planUdcWithdraw).toBeCalledTimes(1);
  });

  test('invalid withdraw amount is zero', async () => {
    wrapper.setData({ amount: 'asdd' });
    expect((wrapper.vm as any).withdrawAmount.isZero()).toBe(true);
  });

  test('invalid if amount is zero', async () => {
    expect((wrapper.vm as any).isValid).toBe(false);
  });

  test('invalid if amount is bigger than capacity', async () => {
    wrapper.setData({ amount: '20' });
    expect((wrapper.vm as any).isValid).toBe(false);
  });

  test('valid if amount is bigger equal to capacity', async () => {
    wrapper.setData({ amount: '10' });
    expect((wrapper.vm as any).isValid).toBe(true);
  });

  describe('with timers', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('emits cancel after done', async () => {
      jest.useFakeTimers();
      wrapper.setData({ amount: '10' });
      await (wrapper.vm as any).planWithdraw();
      jest.advanceTimersByTime(5000);
      expect(wrapper.emitted('cancel')).toBeTruthy();
      jest.useRealTimers();
    });
  });
});
