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
      propsData: {
        token: TestData.token,
        identifier: 1,
        visible: true
      },
      mocks: {
        $t: (msg: string) => msg
      }
    });
  });

  test('emit a "confirm" event when the user presses confirm', async () => {
    mockInput(wrapper, '0.5');
    await wrapper.vm.$nextTick();
    await flushPromises();

    wrapper
      .findAll('button')
      .at(1)
      .trigger('click');
    expect(wrapper.emitted().confirm).toBeTruthy();

    const [events] = wrapper.emitted().confirm;
    const deposit: BigNumber = (events[0] as any) as BigNumber;
    expect(new BigNumber(0.5 * 10 ** 5).eq(deposit)).toBeTruthy();
  });
});
