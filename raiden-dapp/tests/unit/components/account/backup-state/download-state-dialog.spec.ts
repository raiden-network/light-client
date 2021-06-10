/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import DownloadStateDialog from '@/components/account/backup-state/DownloadStateDialog.vue';
import ActionButton from '@/components/ActionButton.vue';

Vue.use(Vuetify);

describe('DownloadStateDialog.vue', () => {
  let wrapper: Wrapper<DownloadStateDialog>;
  let vuetify: Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();

    wrapper = mount(DownloadStateDialog, {
      vuetify,
      stubs: ['v-dialog'],
      mocks: {
        $t: (msg: string) => msg,
      },
      propsData: {
        visible: true,
      },
    });
  });

  test('download state title', () => {
    const downloadStateTitle = wrapper.find('.v-card__title');

    expect(downloadStateTitle.text()).toBe('backup-state.download');
  });

  test('download state warning', () => {
    const downloadStateWarning = wrapper.find('.v-card__text');

    expect(downloadStateWarning.text()).toBe('backup-state.download-warning');
  });

  test('calls method for getting and downloading state', async () => {
    (wrapper.vm as any).getAndDownloadState = jest.fn();
    wrapper.findComponent(ActionButton).trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).getAndDownloadState).toBeCalled();
  });
});
