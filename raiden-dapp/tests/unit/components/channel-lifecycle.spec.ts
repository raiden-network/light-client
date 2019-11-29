import ChannelLifeCycle from '@/components/ChannelLifeCycle.vue';
import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import { ChannelState } from 'raiden-ts';
import Vuetify from 'vuetify';
import Vue from 'vue';

Vue.use(Vuetify);

describe('ChannelLifeCycle.vue', () => {
  let vuetify: typeof Vuetify;
  function createWrapper(
    channelState: ChannelState
  ): Wrapper<ChannelLifeCycle> {
    const localVue = createLocalVue();

    return mount(ChannelLifeCycle, {
      localVue,
      vuetify,
      propsData: {
        state: channelState
      },
      mocks: {
        $t: (msg: string) => msg
      }
    });
  }

  test('channel is "open"', async () => {
    const wrapper = createWrapper(ChannelState.open);
    await wrapper.vm.$nextTick();
    const steps = wrapper.findAll('.v-stepper__step');
    const dividers = wrapper.findAll('.v-divider');
    expect(steps.at(0).classes()).toContain('v-stepper__step--active');
    expect(steps.at(1).classes()).toContain('v-stepper__step--inactive');
    expect(steps.at(2).classes()).toContain('v-stepper__step--inactive');
    expect(dividers.at(0).classes()).not.toContain('active');
    expect(dividers.at(1).classes()).not.toContain('active');
  });

  test('channel is "closed"', async () => {
    const wrapper = createWrapper(ChannelState.closed);
    await wrapper.vm.$nextTick();
    const steps = wrapper.findAll('.v-stepper__step');
    const dividers = wrapper.findAll('.v-divider');
    expect(steps.at(0).classes()).toContain('v-stepper__step');
    expect(steps.at(1).classes()).toContain('v-stepper__step--active');
    expect(steps.at(2).classes()).toContain('v-stepper__step--inactive');
    expect(dividers.at(0).classes()).toContain('active');
    expect(dividers.at(1).classes()).not.toContain('active');
  });

  test('channel is "settleable"', async () => {
    const wrapper = createWrapper(ChannelState.settleable);
    await wrapper.vm.$nextTick();
    const steps = wrapper.findAll('.v-stepper__step');
    const dividers = wrapper.findAll('.v-divider');
    expect(steps.at(0).classes()).toContain('v-stepper__step');
    expect(steps.at(1).classes()).toContain('v-stepper__step');
    expect(steps.at(2).classes()).toContain('v-stepper__step--active');
    expect(dividers.at(0).classes()).toContain('active');
    expect(dividers.at(1).classes()).toContain('active');
  });
});
