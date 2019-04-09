import { mount, Wrapper } from '@vue/test-utils';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { addElemWithDataAppToBody } from '../../utils/dialog';
import DepositDialog from '@/components/dialogs/DepositDialog.vue';
import { TestData } from '../../data/mock-data';
import { mockInput } from '../../utils/interaction-utils';

Vue.use(Vuetify);

describe('DepositDialog.vue', function() {
  addElemWithDataAppToBody();

  let wrapper: Wrapper<DepositDialog>;

  beforeEach(() => {
    wrapper = mount(DepositDialog, {
      propsData: {
        display: true,
        token: TestData.token
      }
    });
  });

  it('should emit a cancel event when cancel pressed', function() {
    wrapper
      .findAll('button')
      .at(0)
      .trigger('click');
    expect(wrapper.emitted().cancel).toBeTruthy();
  });

  it('should emit a confirm event when confirm pressed', function() {
    mockInput(wrapper, '0.00001');
    wrapper
      .findAll('button')
      .at(1)
      .trigger('click');
    expect(wrapper.emitted().confirm).toBeTruthy();
    expect(wrapper.emitted().confirm[0]).toEqual(['0.00001']);
  });
});
