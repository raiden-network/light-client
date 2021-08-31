import { $t } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';

import ActionProgressCard from '@/components/ActionProgressCard.vue';
import Spinner from '@/components/icons/Spinner.vue';
import type { ActionProgressStep } from '@/model/types';

import { generateActionProgressStep } from '../utils/data-generator';

const step = generateActionProgressStep();

function createWrapper(options?: {
  steps?: ActionProgressStep[];
  completed?: boolean;
  error?: Error | null;
}): Wrapper<ActionProgressCard> {
  return shallowMount(ActionProgressCard, {
    mocks: { $t },
    propsData: {
      steps: options?.steps ?? [step],
      completed: options?.completed ?? false,
      error: options?.error ?? null,
    },
  });
}

describe('ActionProgressCard.vue', () => {
  describe('step list', () => {
    test('lists all steps', () => {
      const wrapper = createWrapper({ steps: [step, step] });
      const steps = wrapper.findAll('.action-progress-card__step-list__step');
      const stepIcons = wrapper.findAll('.action-progress-card__step-list__step__status-icon');

      expect(steps.length).toBe(2);
      expect(stepIcons.length).toBe(2);
    });

    test('list steps with their titles', () => {
      const stepOne = generateActionProgressStep({ title: 'step one' });
      const stepTwo = generateActionProgressStep({ title: 'step two' });
      const wrapper = createWrapper({ steps: [stepOne, stepTwo] });
      const steps = wrapper.findAll('.action-progress-card__step-list__step');

      expect(steps.at(0).text()).toBe('step one');
      expect(steps.at(1).text()).toBe('step two');
    });

    test('highlights active steps', () => {
      const activeStep = generateActionProgressStep({ active: true });
      const wrapper = createWrapper({ steps: [activeStep, step] });
      const activeSteps = wrapper.findAll('.action-progress-card__step-list__step--active');
      const activeStepIcons = wrapper.findAll(
        '.action-progress-card__step-list__step__status-icon--active',
      );

      expect(activeSteps.length).toBe(1);
      expect(activeStepIcons.length).toBe(1);
    });

    test('highlights completed steps', () => {
      const completedStep = generateActionProgressStep({ completed: true });
      const activeStep = generateActionProgressStep({ active: true });
      const wrapper = createWrapper({ steps: [completedStep, activeStep] });
      const completedSteps = wrapper.findAll('.action-progress-card__step-list__step--completed');
      const completedStepIcons = wrapper.findAll(
        '.action-progress-card__step-list__step__status-icon--completed',
      );

      expect(completedSteps.length).toBe(1);
      expect(completedStepIcons.length).toBe(1);
    });

    test('highlights failed steps', () => {
      const failedStep = generateActionProgressStep({ failed: true });
      const wrapper = createWrapper({ steps: [failedStep, step] });
      const failedSteps = wrapper.findAll('.action-progress-card__step-list__step--failed');
      const failedStepIcons = wrapper.findAll(
        '.action-progress-card__step-list__step__status-icon--failed',
      );

      expect(failedSteps.length).toBe(1);
      expect(failedStepIcons.length).toBe(1);
    });
  });

  describe('status indicator', () => {
    test('displays spinner if not completed and no error', () => {
      const wrapper = createWrapper({ completed: false, error: null });
      const spinner = wrapper.findComponent(Spinner);
      const statusIcon = wrapper.find('.action-progress-card__status-icon');

      expect(spinner.exists()).toBeTruthy();
      expect(statusIcon.exists()).toBeFalsy();
    });

    test('displays status icon if action completed', () => {
      const wrapper = createWrapper({ completed: true });
      const spinner = wrapper.findComponent(Spinner);
      const statusIcon = wrapper.find('.action-progress-card__status-icon');

      expect(spinner.exists()).toBeFalsy();
      expect(statusIcon.exists()).toBeTruthy();
    });

    test('displays status icon if there is an error', () => {
      const wrapper = createWrapper({ error: new Error() });
      const spinner = wrapper.findComponent(Spinner);
      const statusIcon = wrapper.find('.action-progress-card__status-icon');

      expect(spinner.exists()).toBeFalsy();
      expect(statusIcon.exists()).toBeTruthy();
    });
  });

  describe('details', () => {
    test('displays description of currently active step', () => {
      const stepOne = generateActionProgressStep({
        active: false,
        description: 'description one',
      });
      const stepTwo = generateActionProgressStep({ active: true, description: 'description two' });
      const stepThree = generateActionProgressStep({
        active: false,
        description: 'description three',
      });
      const wrapper = createWrapper({ steps: [stepOne, stepTwo, stepThree] });
      const details = wrapper.find('.action-progress-card__details__step-description');

      expect(details.exists()).toBeTruthy();
      expect(details.text()).toBe('description two');
    });

    test('displays message of error if given', () => {
      const error = new Error('test error message');
      const wrapper = createWrapper({ error });
      const errorMessage = wrapper.find('.action-progress-card__details__error-message');

      expect(errorMessage.exists()).toBeTruthy();
      expect(errorMessage.text()).toBe('test error message');
    });

    test('displays nothing if no step is active (anymore)', () => {
      const inactiveStep = generateActionProgressStep({ active: false });
      const wrapper = createWrapper({ steps: [inactiveStep] });
      const details = wrapper.find('.action-progress-card__details__step-description');
      const errorMessage = wrapper.find('.action-progress-card__details__error-message');

      expect(details.exists()).toBeFalsy();
      expect(errorMessage.exists()).toBeFalsy();
    });
  });
});
