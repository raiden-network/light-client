import { addElemWithDataAppToBody } from '../utils/dialog';
import InPlaceConfirmation from '@/components/InPlaceConfirmation.vue';
import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import Vuetify from 'vuetify';

describe('InPlaceConfirmation.vue', function() {
  let wrapper: Wrapper<InPlaceConfirmation>;

  function createWrapper(): Wrapper<InPlaceConfirmation> {
    const localVue = createLocalVue();
    localVue.use(Vuetify);
    return mount(InPlaceConfirmation, {
      localVue,
      slots: {
        default: `Test`
      },
      attachToDocument: true
    });
  }
  beforeAll(() => {
    addElemWithDataAppToBody();
  });

  beforeEach(() => {
    wrapper = createWrapper();
  });

  afterEach(() => {
    wrapper.destroy();
  });

  test('should remove overlay and emit cancel when cancelled', () => {
    let overlay: HTMLElement | null;
    let modalWrapper: HTMLElement | null;
    overlay = document.getElementById('inplace-confirmation-overlay');
    modalWrapper = document.getElementById(
      'inplace-confirmation-modal-wrapper'
    );

    expect(overlay).toBeTruthy();
    expect(modalWrapper).toBeTruthy();

    wrapper
      .findAll('button')
      .at(0)
      .trigger('click');

    overlay = document.getElementById('inplace-confirmation-overlay');
    modalWrapper = document.getElementById(
      'inplace-confirmation-modal-wrapper'
    );

    expect(overlay).toBeFalsy();
    expect(modalWrapper).toBeFalsy();

    expect(wrapper.emitted().cancel).toBeTruthy();
    expect(wrapper.emitted().cancel[0]).toEqual([]);
  });

  test('should remove overlay and emit cancel when confirmed', () => {
    let overlay: HTMLElement | null;
    let modalWrapper: HTMLElement | null;
    overlay = document.getElementById('inplace-confirmation-overlay');
    modalWrapper = document.getElementById(
      'inplace-confirmation-modal-wrapper'
    );

    expect(overlay).toBeTruthy();
    expect(modalWrapper).toBeTruthy();

    wrapper
      .findAll('button')
      .at(1)
      .trigger('click');

    overlay = document.getElementById('inplace-confirmation-overlay');
    modalWrapper = document.getElementById(
      'inplace-confirmation-modal-wrapper'
    );

    expect(overlay).toBeFalsy();
    expect(modalWrapper).toBeFalsy();

    expect(wrapper.emitted().confirm).toBeTruthy();
    expect(wrapper.emitted().confirm[0]).toEqual([]);
  });
});
