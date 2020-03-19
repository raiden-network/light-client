import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import BackupState from '@/views/BackupState.vue';

Vue.use(Vuetify);

describe('BackupState.vue', () => {
  let wrapper: Wrapper<BackupState>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();

    wrapper = mount(BackupState, {
      vuetify,
      mocks: {
        $t: (msg: string) => msg
      }
    });
  });

  test('download state', () => {
    const downloadStateTitle = wrapper.find(
      '.backup-state__buttons__download-state__title'
    );

    expect(downloadStateTitle.text()).toBe('backup-state.download');
  });

  test('upload state', () => {
    const uploadStateTitle = wrapper.find(
      '.backup-state__buttons__upload-state__title'
    );

    expect(uploadStateTitle.text()).toBe('backup-state.upload');
  });
});
