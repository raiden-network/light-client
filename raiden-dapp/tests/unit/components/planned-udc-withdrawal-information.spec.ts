jest.mock('vue-router');

import { constants } from 'ethers';
import Vue from 'vue';
import Vuetify from 'vuetify';
import VueRouter from 'vue-router';
import { shallowMount, Wrapper } from '@vue/test-utils';
import { generateToken } from '../utils/data-generator';
import Mocked = jest.Mocked;
import Filters from '@/filters';
import { PlannedUdcWithdrawal } from '@/store/user-deposit-contract';
import PlannedUdcWithdrawalInformation from '@/components/PlannedUdcWithdrawalInformation.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import { RouteNames } from '@/router/route-names';

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

const $router = new VueRouter() as Mocked<VueRouter>;

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
      $router,
      $t: (msg: string) => msg,
    },
  });
}

describe('PlannedUdcWithdrawalInformation.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
    const pendingMessage = wrapper.find('.planned-udc-withdrawal-information__pending-message');

    expect(statusIcon.exists()).toBe(true);
    expect(amountDisplay.exists()).toBe(true);
    expect(pendingMessage.exists()).toBe(true);
  });

  test('should display correct counter of blocks until being ready for pending planned withdrawal', () => {
    const wrapper = createWrapper({ plannedWithdrawal: pendingPlannedWithdrawal });
    const pendingMessage = wrapper.find('.planned-udc-withdrawal-information__pending-message');

    expect(pendingMessage.text()).toMatch(/^10\s*UDC\.INFORMATION\.BLOCKS-REMAINING$/);
  });

  test('should display all relevant elements for ready planned withdrawal', () => {
    const wrapper = createWrapper({ plannedWithdrawal: readyPlannedWithdrawal });
    const statusIcon = wrapper.find('.planned-udc-withdrawal-information__status-icon');
    const amountDisplay = wrapper.findComponent(AmountDisplay);
    const navigationLink = wrapper.find('.planned-udc-withdrawal-information__navigation-link');

    expect(statusIcon.exists()).toBe(true);
    expect(amountDisplay.exists()).toBe(true);
    expect(navigationLink.exists()).toBe(true);
  });

  test('should navigate to withdrawal screen when clicking link on ready planned withdrawal', () => {
    const wrapper = createWrapper({ plannedWithdrawal: readyPlannedWithdrawal });
    const navigationLink = wrapper.find('.planned-udc-withdrawal-information__navigation-link');

    navigationLink.trigger('click');

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.ACCOUNT_WITHDRAWAL,
      }),
    );
  });
});
