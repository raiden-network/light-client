import { mount, Wrapper } from '@vue/test-utils';
import Vuetify from 'vuetify';
import Vue from 'vue';
import flushPromises from 'flush-promises';

import MintDialog from '@/components/dialogs/MintDialog.vue';
import { TestData } from '../../data/mock-data';
import Filters from '@/filters';
import { RaidenError, ErrorCodes } from 'raiden-ts';

Vue.use(Vuetify);
Vue.filter('truncate', Filters.truncate);
Vue.filter('displayFormat', Filters.displayFormat);

describe('MintDialog.vue', () => {
  let wrapper: Wrapper<MintDialog>;
  let vuetify: typeof Vuetify;
  const $raiden = { mint: jest.fn().mockResolvedValue(null) };

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(MintDialog, {
      vuetify,
      stubs: ['v-dialog'],
      propsData: {
        token: TestData.token,
        visible: true
      },
      mocks: {
        $t: (msg: string) => msg,
        $te: (msg: string) => msg,
        $raiden
      }
    });
  });

  test('mints token when button is clicked', async () => {
    wrapper.find('.action-button__button').trigger('click');

    await wrapper.vm.$nextTick();
    await flushPromises();

    expect($raiden.mint).toHaveBeenCalled();
    expect($raiden.mint).resolves;
  });

  test('shows an error if minting fails', async () => {
    $raiden.mint = jest
      .fn()
      .mockRejectedValueOnce(new RaidenError(ErrorCodes.RDN_MINT_FAILED));

    wrapper.find('.action-button__button').trigger('click');

    await wrapper.vm.$nextTick();
    await flushPromises();

    expect($raiden.mint).toHaveBeenCalled();
    expect($raiden.mint).rejects;
    expect(wrapper.find('.error-message__title').text()).toContain(
      'errors.RDN_MINT_FAILED.title'
    );
  });
});
