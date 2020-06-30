jest.useFakeTimers();
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import store from '@/store';
import BackupState from '@/views/account/BackupState.vue';

Vue.use(Vuetify);

describe('BackupState.vue', () => {
  let wrapper: Wrapper<BackupState>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();

    wrapper = mount(BackupState, {
      vuetify,
      stubs: ['v-dialog'],
      mocks: {
        $t: (msg: string) => msg,
      },
      store,
    });
  });

  test('download state title', () => {
    const downloadStateTitle = wrapper.find(
      '.backup-state__buttons__download-state__title'
    );

    expect(downloadStateTitle.text()).toBe('backup-state.download');
  });

  test('clicking download state button opens download state dialog', () => {
    expect(wrapper.vm.$data.downloadState).toBe(false);

    const downloadStateButton = wrapper.find(
      '.backup-state__buttons__download-state'
    );
    downloadStateButton.trigger('click');
    expect(wrapper.vm.$data.downloadState).toBe(true);

    jest.advanceTimersByTime(2000);
    const downloadStateDialog = wrapper.find('.download-state');
    expect(downloadStateDialog).toBeTruthy();
  });

  test('upload state title', () => {
    const uploadStateTitle = wrapper.find(
      '.backup-state__buttons__upload-state__title'
    );

    expect(uploadStateTitle.text()).toBe('backup-state.upload');
  });

  test('clicking upload state button opens upload state dialog', () => {
    expect(wrapper.vm.$data.uploadState).toBe(false);

    const uploadStateButton = wrapper.find(
      '.backup-state__buttons__upload-state'
    );
    uploadStateButton.trigger('click');
    expect(wrapper.vm.$data.uploadState).toBe(true);

    jest.advanceTimersByTime(2000);
    const uploadStateDialog = wrapper.find('.upload-state');
    expect(uploadStateDialog).toBeTruthy();
  });

  test('download state button disabled if disconnected', () => {
    const downloadStateButton = wrapper.find(
      '.backup-state__buttons__download-state'
    );

    expect(downloadStateButton.classes()).toContain('v-list-item--disabled');
  });

  // test('upload state', () => {
  //   const uploadStateTitle = wrapper.find(
  //     '.backup-state__buttons__upload-state__title'
  //   );
});
