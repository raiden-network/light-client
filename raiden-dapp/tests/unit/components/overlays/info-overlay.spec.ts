/* eslint-disable @typescript-eslint/no-explicit-any */
import Vue from 'vue';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import InfoOverlay from '@/components/overlays/InfoOverlay.vue';

Vue.use(Vuetify);

const header = 'Info overlay header text';
const body = 'Info overlay body text';

const createWrapper = (): Wrapper<InfoOverlay> => {
  const vuetify = new Vuetify();

  return mount(InfoOverlay, {
    vuetify,
    stubs: ['header-content'],
    mocks: {
      $t: (msg: string) => msg,
      $route: {
        meta: {
          infoOverlay: {
            header,
            body,
          },
        },
      },
    },
  });
};

describe('InfoOverlay.vue', () => {
  test('displays info overlay title text', () => {
    const wrapper = createWrapper();
    const infoOverlayTitle = wrapper.find('.info-overlay__title');

    expect(infoOverlayTitle.text()).toBe(header);
  });

  test('displays info overlay body text', () => {
    const wrapper = createWrapper();
    const infoOverlayBody = wrapper.find('.info-overlay__body');

    expect(infoOverlayBody.text()).toBe(body);
  });

  test('emits closeOverlay when x button is clicked', async () => {
    const wrapper = createWrapper();
    (wrapper.vm as any).closeOverlay = jest.fn();

    const closeButton = wrapper.findAll('button').at(0);
    closeButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).closeOverlay).toHaveBeenCalledTimes(1);
  });

  test('emits closeOverlay when close button is clicked', async () => {
    const wrapper = createWrapper();
    (wrapper.vm as any).closeOverlay = jest.fn();

    const closeButton = wrapper.findAll('button').at(1);
    closeButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).closeOverlay).toHaveBeenCalledTimes(1);
  });
});
