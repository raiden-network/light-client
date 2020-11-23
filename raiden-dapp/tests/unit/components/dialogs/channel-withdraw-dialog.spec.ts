import { mount, Wrapper } from '@vue/test-utils';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { BigNumber, utils } from 'ethers';
import flushPromises from 'flush-promises';
import { TestData } from '../../data/mock-data';
import { mockInput } from '../../utils/interaction-utils';
import ChannelWithdrawDialog from '@/components/dialogs/ChannelWithdrawDialog.vue';

Vue.use(Vuetify);

describe('ChannelWithdraw.vue', () => {
  let wrapper: Wrapper<ChannelWithdrawDialog>;
  let vuetify: Vuetify;
  const channel = TestData.openChannel;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(ChannelWithdrawDialog, {
      vuetify,
      propsData: {
        token: TestData.token,
        channel,
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

  test('emit a "withdraw-tokens" event when the user presses withdrawTokens', async () => {
    mockInput(wrapper, '0.5');
    await wrapper.vm.$nextTick();
    await flushPromises();

    wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('withdraw-tokens')).toBeTruthy();

    const withdrawTokensEvent = wrapper.emitted('withdraw-tokens');
    const events = withdrawTokensEvent?.shift();
    const withdraw: BigNumber = events?.shift() as BigNumber;
    expect(BigNumber.from(0.5 * 10 ** 5).eq(withdraw)).toBeTruthy();
  });

  test("maximum of channel's capacity", async () => {
    mockInput(wrapper, utils.formatUnits(channel.capacity.add(1), TestData.token.decimals));
    await wrapper.vm.$nextTick();
    await flushPromises();
    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toEqual('amount-input.error.not-enough-funds');

    mockInput(wrapper, utils.formatUnits(channel.capacity, TestData.token.decimals));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.v-messages__message').exists()).toBe(false);
  });
});
