import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import { constants } from 'ethers';
import Vue from 'vue';
import Vuetify from 'vuetify';

import AmountDisplay from '@/components/AmountDisplay.vue';
import PlannedUdcWithdrawalInformation from '@/components/PlannedUdcWithdrawalInformation.vue';
import Filters from '@/filters';
import type { PlannedUdcWithdrawal } from '@/store/user-deposit-contract';

import { generateToken } from '../utils/data-generator';

Vue.use(Vuetify);
Vue.filter('upperCase', Filters.upperCase);

const udcToken = generateToken();

const dateBeforeWithdrawable = new Date(100000 * 1000);
const dateWhenWithdrawable = new Date(200000 * 1000);
const dateAfterWithdrawable = new Date(300000 * 1000);

const plannedWithdrawal: PlannedUdcWithdrawal = {
  txHash: '0xTxHash',
  txBlock: 80,
  amount: constants.One,
  withdrawableAfter: Math.floor(dateWhenWithdrawable.getTime() / 1000),
  confirmed: true,
};

function createWrapper(props: {
  plannedWithdrawal?: PlannedUdcWithdrawal;
}): Wrapper<PlannedUdcWithdrawalInformation> {
  const vuetify = new Vuetify();

  return shallowMount(PlannedUdcWithdrawalInformation, {
    vuetify,
    propsData: {
      udcToken,
      ...props,
    },
    mocks: {
      $t: (msg: string, placeholder: unknown[] = []) => `${msg} ${placeholder}`,
    },
  });
}

describe('PlannedUdcWithdrawalInformation.vue', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('should show that no withdrawal is in progress if withdraw plan property is missing', () => {
    jest.setSystemTime(dateBeforeWithdrawable);
    const wrapper = createWrapper({ plannedWithdrawal: undefined });

    expect(wrapper.find('.planned-udc-withdrawal-information').text()).toBe(
      'UDC.INFORMATION.NO-WITHDRAWAL-IN-PROGRESS',
    );
  });

  test('should display all relevant elements for pending withdrawal', () => {
    jest.setSystemTime(dateBeforeWithdrawable);
    const wrapper = createWrapper({ plannedWithdrawal });
    const statusIcon = wrapper.find('.planned-udc-withdrawal-information__status-icon');
    const amountDisplay = wrapper.findComponent(AmountDisplay);
    const message = wrapper.find('.planned-udc-withdrawal-information__message');

    expect(statusIcon.exists()).toBe(true);
    expect(amountDisplay.exists()).toBe(true);
    expect(message.exists()).toBe(true);
  });

  test('should display correct date when pending planned withdrawal becomes ready', () => {
    jest.setSystemTime(dateBeforeWithdrawable);
    const wrapper = createWrapper({ plannedWithdrawal });
    const message = wrapper.find('.planned-udc-withdrawal-information__message');

    expect(message.text()).toBe('UDC.INFORMATION.PENDING-MESSAGE 1/3/1970, 8:33:20 AM');
  });

  test('should set timer to update component when approximately becoming ready', async () => {
    jest.setSystemTime(dateBeforeWithdrawable);
    const wrapper = createWrapper({ plannedWithdrawal });

    jest.setSystemTime(dateAfterWithdrawable);
    jest.runAllTimers();
    await wrapper.vm.$nextTick();

    const message = wrapper.find('.planned-udc-withdrawal-information__message');
    expect(message.text()).toBe('UDC.INFORMATION.READY-MESSAGE');
  });

  test('should display all relevant elements for ready planned withdrawal', () => {
    jest.setSystemTime(dateAfterWithdrawable);
    const wrapper = createWrapper({ plannedWithdrawal });
    const statusIcon = wrapper.find('.planned-udc-withdrawal-information__status-icon');
    const amountDisplay = wrapper.findComponent(AmountDisplay);
    const message = wrapper.find('.planned-udc-withdrawal-information__message');

    expect(statusIcon.exists()).toBe(true);
    expect(amountDisplay.exists()).toBe(true);
    expect(message.exists()).toBe(true);
  });

  test('should display correct message for ready planned withdrawal', () => {
    jest.setSystemTime(dateAfterWithdrawable);
    const wrapper = createWrapper({ plannedWithdrawal });
    const message = wrapper.find('.planned-udc-withdrawal-information__message');

    expect(message.text()).toBe('UDC.INFORMATION.READY-MESSAGE');
  });
});
