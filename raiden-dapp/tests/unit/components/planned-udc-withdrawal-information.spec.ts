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
const pendingPlannedWithdrawal: PlannedUdcWithdrawal = {
  txHash: '0xTxHash',
  txBlock: 80,
  amount: constants.One,
  withdrawBlock: 110,
  confirmed: true,
};

const readyPlannedWithdrawal: PlannedUdcWithdrawal = {
  ...pendingPlannedWithdrawal,
  withdrawBlock: 99,
};

function createWrapper(props: {
  plannedWithdrawal?: PlannedUdcWithdrawal;
  blockNumber?: number;
}): Wrapper<PlannedUdcWithdrawalInformation> {
  const vuetify = new Vuetify();

  return shallowMount(PlannedUdcWithdrawalInformation, {
    vuetify,
    propsData: {
      udcToken,
      blockNumber: 100,
      ...props,
    },
    mocks: {
      $t: (msg: string) => msg,
    },
  });
}

describe('PlannedUdcWithdrawalInformation.vue', () => {
  test('should show that no withdrawal is in progress if withdraw plan property is missing', () => {
    const wrapper = createWrapper({ plannedWithdrawal: undefined });

    expect(wrapper.find('.planned-udc-withdrawal-information').text()).toBe(
      'UDC.INFORMATION.NO-WITHDRAWAL-IN-PROGRESS',
    );
  });

  test('should display all relevant elements for pending withdrawal', () => {
    const wrapper = createWrapper({ plannedWithdrawal: pendingPlannedWithdrawal });
    const statusIcon = wrapper.find('.planned-udc-withdrawal-information__status-icon');
    const amountDisplay = wrapper.findComponent(AmountDisplay);
    const message = wrapper.find('.planned-udc-withdrawal-information__message');

    expect(statusIcon.exists()).toBe(true);
    expect(amountDisplay.exists()).toBe(true);
    expect(message.exists()).toBe(true);
  });

  test('should display correct counter of blocks until being ready for pending planned withdrawal', () => {
    const wrapper = createWrapper({ plannedWithdrawal: pendingPlannedWithdrawal });
    const message = wrapper.find('.planned-udc-withdrawal-information__message');

    expect(message.text()).toMatch(/^10\s*UDC\.INFORMATION\.PENDING-MESSAGE$/);
  });

  test('should display all relevant elements for ready planned withdrawal', () => {
    const wrapper = createWrapper({ plannedWithdrawal: readyPlannedWithdrawal });
    const statusIcon = wrapper.find('.planned-udc-withdrawal-information__status-icon');
    const amountDisplay = wrapper.findComponent(AmountDisplay);
    const message = wrapper.find('.planned-udc-withdrawal-information__message');

    expect(statusIcon.exists()).toBe(true);
    expect(amountDisplay.exists()).toBe(true);
    expect(message.exists()).toBe(true);
  });

  test('should display correct message for ready planned withdrawal', () => {
    const wrapper = createWrapper({ plannedWithdrawal: readyPlannedWithdrawal });
    const message = wrapper.find('.planned-udc-withdrawal-information__message');

    expect(message.text()).toBe('UDC.INFORMATION.READY-MESSAGE');
  });
});
