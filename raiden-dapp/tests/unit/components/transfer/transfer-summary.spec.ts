import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import { BigNumber } from 'ethers';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import TransferSummary from '@/components/transfer/TransferSummary.vue';
import type { Transfer } from '@/model/types';

import { paymentId, TestData } from '../../data/mock-data';

Vue.use(Vuetify);
Vue.use(Vuex);

let wrapper: Wrapper<TransferSummary>;
let vuetify: Vuetify;

const createWrapper = (transfer: Transfer) =>
  mount(TransferSummary, {
    vuetify,
    mocks: {
      $t: (msg: string) => msg,
    },
    propsData: {
      transfer,
    },
  });

describe('TransferSummary.vue', () => {
  const directTransfer = TestData.mockDirectTransfer;
  const mediatedTransfer = TestData.mockMediatedTransfer;

  beforeEach(() => {
    vuetify = new Vuetify();
  });

  test('show direct transfer breakdown', () => {
    wrapper = createWrapper(directTransfer);

    expect(wrapper.text()).toContain(paymentId.toString());

    // Shows direct transfer header
    expect(wrapper.find('.transfer-summary__header').text()).toContain(
      'transfer.steps.summary.direct-transfer',
    );

    // Shows explanation because route request and selection was skipped
    expect(wrapper.find('.transfer-summary__explanation li').text()).toContain(
      'transfer.steps.summary.footnotes.direct-transfer',
    );
  });

  test('show mediated transfer breakdown', () => {
    wrapper = createWrapper(mediatedTransfer);

    const routeRequestHeader = wrapper.findAll('.transfer-summary__header').at(1);
    const explanations = wrapper.find('.transfer-summary__explanation');

    // Shows mediated transfer header
    expect(routeRequestHeader.text()).toContain('transfer.steps.summary.mediated-transfer');

    // Shows no explanations if nothing was skipped
    expect(explanations.text()).toEqual('');
  });

  test('show explanation if mediated transfer w/ zero fees', () => {
    wrapper = createWrapper({
      ...mediatedTransfer,
      mediationFee: BigNumber.from(0),
    });

    const explanations = wrapper.find('.transfer-summary__explanation');

    // Shows explanations if nothing was skipped
    expect(explanations.text()).toEqual(
      'transfer.steps.summary.footnotes.route-selection-skipped',
    );
  });
});
