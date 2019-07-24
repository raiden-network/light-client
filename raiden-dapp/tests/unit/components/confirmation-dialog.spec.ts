import { mount, Wrapper } from '@vue/test-utils';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { addElemWithDataAppToBody } from '../utils/dialog';

Vue.use(Vuetify);

describe('ConfirmationDialog.vue', function() {
  addElemWithDataAppToBody();

  let wrapper: Wrapper<ConfirmationDialog>;

  beforeEach(() => {
    wrapper = mount(ConfirmationDialog, {
      propsData: {
        display: true
      },
      slots: {
        default: `<div class="description">Description</div>`,
        header: `<span class="title">Title</span>`
      }
    });
  });

  it('should fill the slots with the proper information', function() {
    const title = wrapper.find('.title');
    const description = wrapper.find('.description');
    expect(description.exists()).toBeTruthy();
    expect(description.text().trim()).toEqual('Description');
    expect(title.exists()).toBeTruthy();
    expect(title.text().trim()).toEqual('Title');
  });

  it('should emit a cancel event when cancel pressed', function() {
    wrapper
      .findAll('button')
      .at(0)
      .trigger('click');
    expect(wrapper.emitted().cancel).toBeTruthy();
  });

  it('should emit a confirm event when confirm pressed', function() {
    wrapper
      .findAll('button')
      .at(1)
      .trigger('click');
    expect(wrapper.emitted().confirm).toBeTruthy();
  });
});
