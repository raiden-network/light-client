import Vue from 'vue';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import InstallBanner from '@/components/InstallBanner.vue';

Vue.use(Vuetify);

type InstallPromptFunction = () => Promise<void>;

class BeforeInstallPromptEvent extends Event implements BeforeInstallPromptEvent {
  constructor(public prompt: InstallPromptFunction) {
    super('beforeinstallprompt');
  }
}

function emitBeforeInstallPromptEvent(installPrompt?: InstallPromptFunction) {
  const event = new BeforeInstallPromptEvent(installPrompt ?? (async () => undefined));
  window.dispatchEvent(event);
}

async function createWrapper(shouldBeVisible = false): Promise<Wrapper<InstallBanner>> {
  const vuetify = new Vuetify();
  const wrapper = mount(InstallBanner, {
    vuetify,
    mocks: {
      $t: (msg: string) => msg,
    },
  });

  if (shouldBeVisible) {
    emitBeforeInstallPromptEvent();
    await wrapper.vm.$nextTick();
  }

  return wrapper;
}

function getInstallButton(wrapper: Wrapper<InstallBanner>): Wrapper<Vue> {
  return wrapper.get('.install-banner__install-button');
}

describe('InstallBanner.vue', () => {
  test('is not visible per default', async () => {
    const wrapper = await createWrapper();

    expect(wrapper.isVisible()).toBe(false);
  });

  test('is visible if browser emits beforeinstallprompt event', async () => {
    const wrapper = await createWrapper(true);

    emitBeforeInstallPromptEvent();
    await wrapper.vm.$nextTick();

    expect(wrapper.isVisible()).toBe(true);
  });

  test('becomes hidden when install button gets clicked', async () => {
    const wrapper = await createWrapper(true);
    const installButton = getInstallButton(wrapper);

    installButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.isVisible()).toBe(false);
  });

  test('triggers installation if install button gets clicked', async () => {
    const wrapper = await createWrapper(true);
    const installButton = getInstallButton(wrapper);
    const installPromptSpy = jest.fn(async () => undefined);

    emitBeforeInstallPromptEvent(installPromptSpy);
    installButton.trigger('click');

    expect(installPromptSpy).toHaveBeenCalledTimes(1);
  });
});
