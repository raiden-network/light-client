import { mount, Wrapper } from '@vue/test-utils';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { TestData } from '../data/mock-data';
import { mockInput } from '../utils/interaction-utils';
import ChannelDepositDialog from '@/components/ChannelDepositDialog.vue';
import { BigNumber } from 'ethers/utils';
import flushPromises from 'flush-promises';

Vue.use(Vuetify);

describe('ChannelDeposit.vue', () => {
  let wrapper: Wrapper<ChannelDepositDialog>;
  let vuetify: typeof Vuetify;

  beforeAll(() => {
    vuetify = new Vuetify();
    wrapper = mount(ChannelDepositDialog, {
      vuetify,
      propsData: {
        token: TestData.token,
        identifier: 1,
        visible: true,
        loading: false
      },
      stubs: ['raiden-dialog'],
      mocks: {
        $t: (msg: string) => msg
      }
    });
  });

  test('emit a "depositTokens" event when the user presses depositTokens', async () => {
    mockInput(wrapper, '0.5');
    await wrapper.vm.$nextTick();
    await flushPromises();

    wrapper
      .findAll('button')
      .at(0)
      .trigger('click');
    expect(wrapper.emitted().depositTokens).toBeTruthy();

    const [events] = wrapper.emitted().depositTokens;
    const deposit: BigNumber = (events[0] as any) as BigNumber;
    expect(new BigNumber(0.5 * 10 ** 5).eq(deposit)).toBeTruthy();
  });
});
