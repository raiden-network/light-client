import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import store from '@/store';
import { BigNumber } from 'ethers';
import TransferProgressDialog from '@/components/dialogs/TransferProgressDialog.vue';

Vue.use(Vuetify);

describe('TransferProgressDialog.vue', () => {
  let wrapper: Wrapper<TransferProgressDialog>;
  let vuetify: Vuetify;
  const transferPending = {
    key: 'sent:0x1',
    paymentId: BigNumber.from('0x1'),
    status: 'PENDING'
  };
  const transferRequested = {
    key: 'sent:0x1',
    paymentId: BigNumber.from('0x1'),
    status: 'REQUESTED'
  };

  beforeEach(() => {
    vuetify = new Vuetify();
    store.commit('updateTransfers', transferPending);
    wrapper = mount(TransferProgressDialog, {
      vuetify,
      store,
      stubs: ['v-dialog'],
      mocks: {
        $t: (msg: string) => msg
      },
      propsData: {
        visible: true,
        inProgress: true,
        error: false,
        identifier: transferPending.paymentId
      }
    });
  });

  test('Update progress on transfer change', async () => {
    expect(wrapper.html()).toContain('PENDING');
    store.commit('updateTransfers', transferRequested);
    await wrapper.vm.$nextTick();
    expect(wrapper.html()).toContain('REQUESTED');
  });
});
