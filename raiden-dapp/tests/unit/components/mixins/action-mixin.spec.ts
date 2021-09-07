/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import { Component, Mixins, Prop } from 'vue-property-decorator';

import ActionProgressCard from '@/components/ActionProgressCard.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import ActionMixin from '@/mixins/action-mixin';
import type { ActionProgressStep } from '@/model/types';

@Component
class TestAction extends Mixins(ActionMixin) {
  @Prop({ default: false })
  readonly actionShouldComplete!: boolean;

  get confirmButtonLabel(): string {
    return 'test-label';
  }

  get steps(): ActionProgressStep[] {
    return ['fake step' as unknown as ActionProgressStep];
  }

  async handleAction() {
    await new Promise((resolve) => {
      if (this.actionShouldComplete) {
        resolve(null);
      }
    });
  }
}

function createWrapper(options?: {
  showProgressInDialog?: boolean;
  completionDelayTimeout?: number;
  slot?: string;
  steps?: ActionProgressStep[];
  actionShouldComplete?: boolean;
}): Wrapper<TestAction> {
  return shallowMount(TestAction, {
    propsData: {
      showProgressInDialog: options?.showProgressInDialog,
      completionDelayTimeout: options?.completionDelayTimeout ?? 10,
      // Test only properties
      actionShouldComplete: options?.actionShouldComplete,
    },
    slots: {
      default: options?.slot ? [options?.slot] : [],
    },
  });
}

async function triggerAction(wrapper: Wrapper<TestAction>): Promise<void> {
  (wrapper.vm as any).runAction({});
  await wrapper.vm.$nextTick();
}

async function triggerAndCompleteAction(wrapper: Wrapper<TestAction>): Promise<void> {
  await triggerAction(wrapper);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await wrapper.vm.$nextTick();
}

describe('ActionMixin', () => {
  afterEach(() => {
    // For the maybe still open action handler promise.
    flushPromises();
  });

  // TODO: it would be amazing to verify that this slot component got rendered
  // with certain properties.
  test('renders default slot', () => {
    const slot = '<p>test</p>';
    const wrapper = createWrapper({ slot });

    expect(wrapper.html()).toContain('<p>test</p>');
  });

  test('hides slot when action progress is visible', async () => {
    const slot = '<p>test</p>';
    const wrapper = createWrapper({ slot });

    await triggerAction(wrapper);

    expect(wrapper.html()).not.toContain('<p>test</p>');
  });

  test('shows progress card when action started', async () => {
    const wrapper = createWrapper();

    await triggerAction(wrapper);

    const progressCard = wrapper.findComponent(ActionProgressCard);
    expect(progressCard.exists()).toBeTruthy();
  });

  test('shows progress in dialog if set so', async () => {
    const wrapper = createWrapper({ showProgressInDialog: true });

    await triggerAction(wrapper);

    const dialog = wrapper.findComponent(RaidenDialog);
    expect(dialog.exists()).toBeTruthy();
  });

  test('keeps slot in place when action progress is visible in a dialog', async () => {
    const slot = '<p>test</p>';
    const wrapper = createWrapper({ showProgressInDialog: true, slot });

    await triggerAction(wrapper);

    expect(wrapper.html()).toContain('<p>test</p>');
  });

  test('hides progress card when action completes', async () => {
    const wrapper = createWrapper({ actionShouldComplete: true });

    await triggerAndCompleteAction(wrapper);

    const progressCard = wrapper.findComponent(ActionProgressCard);
    expect(progressCard.exists()).toBeFalsy();
  });

  test('emits started event when actions gets triggered', async () => {
    const wrapper = createWrapper();

    await triggerAndCompleteAction(wrapper);

    expect(wrapper.emitted('started')).toBeTruthy();
  });

  test('emits completed event when actions completes', async () => {
    const wrapper = createWrapper({ actionShouldComplete: true });

    await triggerAndCompleteAction(wrapper);

    expect(wrapper.emitted('completed')).toBeTruthy();
  });

  test('delays completion event by set timeout', async () => {
    const wrapper = createWrapper({ actionShouldComplete: true, completionDelayTimeout: 500 });

    await triggerAction(wrapper);
    expect(wrapper.emitted('completed')).toBeFalsy();

    await new Promise((resolve) => setTimeout(resolve, 200));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('completed')).toBeFalsy();

    await new Promise((resolve) => setTimeout(resolve, 400)); // Add buffer
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('completed')).toBeTruthy();
  });

  // TODO: tests for failing handle action (for some reason there are JS issues here...)
  // TODO: tests for ability to be "re-used" again
});
