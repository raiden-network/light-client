import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import UploadStateDialog from '@/components/UploadStateDialog.vue';

Vue.use(Vuetify);

describe('UploadStateDialog.vue', () => {
  let wrapper: Wrapper<UploadStateDialog>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();

    wrapper = mount(UploadStateDialog, {
      vuetify,
      stubs: ['v-dialog'],
      mocks: {
        $t: (msg: string) => msg
      },
      propsData: {
        visible: true
      }
    });
  });

  test('upload state title', () => {
    const uploadStateTitle = wrapper.find('.v-card__title');

    expect(uploadStateTitle.text()).toBe('backup-state.upload');
  });

  test('dropzone is activated when dragged enter', async () => {
    expect(wrapper.vm.$data.dragCount).toBe(0);
    expect(wrapper.vm.$data.activeDropzone).toEqual(false);

    const dropzone = wrapper.find('.upload-state__dropzone');
    dropzone.trigger('dragenter');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data.dragCount).toBe(1);
    expect(wrapper.vm.$data.activeDropzone).toEqual(true);
  });

  test('dropzone is deactivated when dragged leave', async () => {
    const dropzone = wrapper.find('.upload-state__dropzone');
    dropzone.trigger('dragenter');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data.dragCount).toBe(1);
    expect(wrapper.vm.$data.activeDropzone).toEqual(true);

    dropzone.trigger('dragleave');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data.dragCount).toBe(0);
    expect(wrapper.vm.$data.activeDropzone).toEqual(false);
  });

  test('calls methods for uploading state on dropzone drop', async () => {
    // @ts-ignore
    wrapper.vm.uploadState = jest.fn();
    // @ts-ignore
    expect(wrapper.vm.uploadState).not.toBeCalled();

    const dropzone = wrapper.find('.upload-state__dropzone');
    dropzone.trigger('dragenter');
    dropzone.trigger('drop');
    await wrapper.vm.$nextTick();

    // @ts-ignore
    expect(wrapper.vm.uploadState).toBeCalled();
  });

  test('calls methods for uploading state on file select', async () => {
    // @ts-ignore
    wrapper.vm.uploadState = jest.fn();
    // @ts-ignore
    expect(wrapper.vm.uploadState).not.toBeCalled();

    const stateInput = wrapper.find('input');
    // @ts-ignore
    stateInput.element.value = '';
    stateInput.trigger('change');
    await wrapper.vm.$nextTick();

    // @ts-ignore
    expect(wrapper.vm.uploadState).toBeCalled();
  });
});
