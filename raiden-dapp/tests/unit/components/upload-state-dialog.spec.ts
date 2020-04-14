jest.useFakeTimers();
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import UploadStateDialog from '@/components/UploadStateDialog.vue';

Vue.use(Vuetify);

describe('UploadStateDialog.vue', () => {
  let wrapper: Wrapper<UploadStateDialog>;
  let vuetify: typeof Vuetify;
  let mockStateFile: File;

  beforeEach(() => {
    vuetify = new Vuetify();
    mockStateFile = new File([''], 'raiden-state-file.json', {
      type: 'application/json'
    });

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

  test('method for dropzone error displays and hides dropzone error message', async () => {
    // @ts-ignore
    wrapper.vm.dropzoneError();

    expect(wrapper.vm.$data.dropzoneErrorMessage).toBe(true);
    jest.advanceTimersByTime(2000);
    expect(wrapper.vm.$data.dropzoneErrorMessage).toBe(false);
  });

  test('method for uploading state displays dropzone error message if > 1 file is uploaded', () => {
    expect(wrapper.vm.$data.dropzoneErrorMessage).toBe(false);

    const fileList = {
      0: mockStateFile,
      1: mockStateFile,
      length: 2
    };
    // @ts-ignore
    wrapper.vm.uploadState(fileList);

    expect(wrapper.vm.$data.dropzoneErrorMessage).toBe(true);
  });

  test('method for uploading state does not display error message if only 1 file is uploaded', () => {
    expect(wrapper.vm.$data.dropzoneErrorMessage).toBe(false);

    const fileList = {
      0: mockStateFile,
      length: 1
    };
    // @ts-ignore
    wrapper.vm.uploadState(fileList);

    expect(wrapper.vm.$data.dropzoneErrorMessage).toBe(false);
  });
});
