import { mount, Wrapper } from '@vue/test-utils';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { addElemWithDataAppToBody } from '../utils/dialog';
import { TestData } from '../data/mock-data';
import { mockInput } from '../utils/interaction-utils';
import ChannelDeposit from '@/components/ChannelDeposit.vue';
import { BigNumber } from 'ethers/utils';

Vue.use(Vuetify);

describe('ChannelDeposit.vue', () => {
  addElemWithDataAppToBody();

  let wrapper: Wrapper<ChannelDeposit>;

  beforeAll(() => {
    wrapper = mount(ChannelDeposit, {
      propsData: {
        token: TestData.token,
        identifier: 1
      },
      mocks: {
        $t: (msg: string) => msg
      }
    });
  });

  test('should emit a cancel event when cancel pressed', () => {
    wrapper
      .findAll('button')
      .at(0)
      .trigger('click');
    expect(wrapper.emitted().cancel).toBeTruthy();
  });

  test('should emit a confirm event when confirm pressed', () => {
    mockInput(wrapper, '0.5');
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
