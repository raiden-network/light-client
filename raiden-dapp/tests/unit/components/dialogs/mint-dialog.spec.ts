import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';

import { ErrorCodes, RaidenError } from 'raiden-ts';

import ActionButton from '@/components/ActionButton.vue';
import MintDialog from '@/components/dialogs/MintDialog.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import Filters from '@/filters';

import { TestData } from '../../data/mock-data';

Vue.use(Vuetify);
Vue.filter('truncate', Filters.truncate);
Vue.filter('displayFormat', Filters.displayFormat);

describe('MintDialog.vue', () => {
  let wrapper: Wrapper<MintDialog>;
  let vuetify: Vuetify;
  const $raiden = { mint: jest.fn().mockResolvedValue(null) };

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(MintDialog, {
      vuetify,
      stubs: ['v-dialog'],
      propsData: {
        token: TestData.token,
        visible: true,
      },
      mocks: {
        $t: (msg: string) => msg,
        $te: (msg: string) => msg,
        $raiden,
      },
    });
  });

  test('mints token when button is clicked', async () => {
    wrapper.findComponent(ActionButton).trigger('click');

    await wrapper.vm.$nextTick();
    await flushPromises();

    expect($raiden.mint).toHaveBeenCalled();
    expect($raiden.mint).resolves;
  });

  test('shows an error if minting fails', async () => {
    $raiden.mint = jest.fn().mockRejectedValueOnce(new RaidenError(ErrorCodes.RDN_MINT_FAILED));

    wrapper.findComponent(ActionButton).trigger('click');

    await wrapper.vm.$nextTick();
    await flushPromises();

    expect($raiden.mint).toHaveBeenCalled();
    expect($raiden.mint).rejects;
    expect(wrapper.findComponent(ErrorMessage).text()).toContain('errors.RDN_MINT_FAILED.title');
  });
});
