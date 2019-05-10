import ChannelLifeCycle from '@/components/ChannelLifeCycle.vue';
import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import { ChannelState } from 'raiden';
import Vuetify from 'vuetify';

describe('ChannelLifeCycle.vue', function() {
  function createWrapper(
    channelState: ChannelState
  ): Wrapper<ChannelLifeCycle> {
    const localVue = createLocalVue();
    localVue.use(Vuetify);
    return mount(ChannelLifeCycle, {
      localVue,
      propsData: {
        state: channelState
      }
    });
  }

  test('channel is open', async () => {
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

  test('channel is closed', async () => {
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

  test('channel is settleable', async () => {
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
