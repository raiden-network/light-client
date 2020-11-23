/* eslint-disable @typescript-eslint/no-explicit-any */
import { mount, Wrapper } from '@vue/test-utils';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { BigNumber } from 'ethers';
import flushPromises from 'flush-promises';
import { TestData } from '../../data/mock-data';
import { mockInput } from '../../utils/interaction-utils';
import ChannelDepositDialog from '@/components/dialogs/ChannelDepositDialog.vue';

Vue.use(Vuetify);

describe('ChannelDeposit.vue', () => {
  let wrapper: Wrapper<ChannelDepositDialog>;
  let vuetify: Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(ChannelDepositDialog, {
      vuetify,
      propsData: {
        token: TestData.token,
        identifier: 1,
        visible: true,
        loading: false,
      },
      stubs: ['raiden-dialog'],
      mocks: {
        $t: (msg: string) => msg,
        $raiden: {
          fetchAndUpdateTokenData: jest.fn(),
        },
      },
    });
  });

  test('emit a "deposit-tokens" event when the user presses depositTokens', async () => {
    mockInput(wrapper, '0.5');
    await wrapper.vm.$nextTick();
    await flushPromises();

    wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('deposit-tokens')).toBeTruthy();

    const depositTokensEvent = wrapper.emitted('deposit-tokens');
    const events = depositTokensEvent?.shift();
    const deposit: BigNumber = events?.shift() as BigNumber;
    expect(BigNumber.from(0.5 * 10 ** 5).eq(deposit)).toBeTruthy();
  });

  test('do not update the deposit placeholder if dialog hides', async () => {
    wrapper.setProps({ token: { ...TestData.token, decimals: 0 } });
    expect(wrapper.vm.$data.deposit).toBe('0.0');
    (wrapper.vm as any).onVisibilityChanged(false);
    expect(wrapper.vm.$data.deposit).toBe('0.0');
  });

  test('update the deposit placeholder if dialog shows', async () => {
    wrapper.setProps({ token: { ...TestData.token, decimals: 0 } });
    expect(wrapper.vm.$data.deposit).toBe('0.0');
    (wrapper.vm as any).onVisibilityChanged(true);
    expect(wrapper.vm.$data.deposit).toBe('0');
  });
});
