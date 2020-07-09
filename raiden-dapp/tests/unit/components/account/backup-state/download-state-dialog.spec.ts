import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import DownloadStateDialog from '@/components/account/backup-state/DownloadStateDialog.vue';

Vue.use(Vuetify);

describe('DownloadStateDialog.vue', () => {
  let wrapper: Wrapper<DownloadStateDialog>;
  let vuetify: typeof Vuetify;

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
    // @ts-ignore
    wrapper.vm.getAndDownloadState = jest.fn();
    wrapper.find('.action-button__button').trigger('click');
    await wrapper.vm.$nextTick();

    // @ts-ignore
    expect(wrapper.vm.getAndDownloadState).toBeCalled();
  });
});
