/* eslint-disable @typescript-eslint/no-explicit-any */
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import { generateSuggestedPartner } from '../utils/data-generator';
import HubList from '@/components/HubList.vue';
import { SuggestedPartner } from '@/types';

Vue.use(Vuetify);

const addressOne = '0x123';
const addressTwo = '0x456';
const addressThree = '0x789';
const suggestedPartners = [
  generateSuggestedPartner({ address: addressOne }),
  generateSuggestedPartner({ address: addressTwo }),
  generateSuggestedPartner({ address: addressThree }),
];

const createWrapper = (
  suggestedPartners: SuggestedPartner[],
  request_error = false,
): Wrapper<HubList> => {
  const vuetify = new Vuetify();

  return mount(HubList, {
    vuetify,
    mocks: {
      $t: (msg: string) => msg,
      $raiden: {
        getSuggestedPartners: request_error
          ? jest.fn().mockRejectedValue(new Error('Error'))
          : jest.fn().mockResolvedValue(suggestedPartners),
      },
    },
    propsData: {
      tokenAddress: '0x123',
    },
  });
};

describe('HubList', () => {
  test('displays spinner while fetching suggested hubs data', () => {
    const wrapper = createWrapper([]);
    const spinner = wrapper.find('.spinner');

    expect(wrapper.vm.$data.loadingHubs).toBe(true);
    expect(spinner.exists()).toBe(true);
  });

  test('displays message when no hubs available', async () => {
    const wrapper = createWrapper([]);
    await flushPromises();

    const hubList = wrapper.find('.hub-list__no-hubs');

    expect(hubList.text()).toContain('hub-list.no-results');
  });

  test('displays error if request fails', async () => {
    const wrapper = createWrapper([], true);
    await flushPromises();

    const hubList = wrapper.find('.hub-list__no-hubs');

    expect(hubList.text()).toContain('hub-list.error');
  });

  test('clicking a suggested partner adds the address as selectedHub', async () => {
    const wrapper = createWrapper(suggestedPartners);
    await flushPromises();

    const selectHubButton = wrapper.findAll('.hub-list__item__select-button').at(0);
    selectHubButton.trigger('click');

    await wrapper.vm.$nextTick();
    expect(wrapper.vm.$data.selectedHub).toEqual(addressOne);
  });

  test('clicking a suggested partner emits selectHub', async () => {
    const wrapper = createWrapper(suggestedPartners);
    (wrapper.vm as any).selectHub = jest.fn();
    await flushPromises();

    const selectHubButton = wrapper.findAll('.hub-list__item__select-button').at(0);
    selectHubButton.trigger('click');

    await wrapper.vm.$nextTick();
    expect((wrapper.vm as any).selectHub).toHaveBeenCalledTimes(1);
  });

  test('clicking a suggested partner displays button as checkmarked', async () => {
    const wrapper = createWrapper(suggestedPartners);
    await flushPromises();

    const selectHubButton = wrapper.findAll('.hub-list__item__select-button').at(0);

    expect(selectHubButton.text()).toContain('hub-list.select-button');

    selectHubButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(selectHubButton.text()).not.toContain('hub-list.select-button');

    const selectHubButtonIcon = wrapper
      .findAll('.hub-list__item__select-button__selected-icon')
      .at(0);

    expect(selectHubButtonIcon.exists()).toBe(true);
  });

  test('clicking a already selected partner deselects the address as selectedHub', async () => {
    const wrapper = createWrapper(suggestedPartners);
    await flushPromises();

    const selectHubButton = wrapper.findAll('.hub-list__item__select-button').at(1);
    selectHubButton.trigger('click');

    await wrapper.vm.$nextTick();
    expect(wrapper.vm.$data.selectedHub).toEqual(addressTwo);

    selectHubButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data.selectedHub).toEqual('');
  });
});
