<template>
  <div data-cy="action-progress-card" class="action-progress-card">
    <ul class="action-progress-card__step-list">
      <li
        v-for="(step, index) in steps"
        :key="index"
        class="action-progress-card__step-list__step"
        :class="{
          'action-progress-card__step-list__step--active': step.active,
          'action-progress-card__step-list__step--completed': step.completed,
          'action-progress-card__step-list__step--failed': step.failed,
        }"
      >
        <img
          class="action-progress-card__step-list__step__status-icon"
          :class="{
            'action-progress-card__step-list__step__status-icon--active': step.active,
            'action-progress-card__step-list__step__status-icon--completed': step.completed,
            'action-progress-card__step-list__step__status-icon--failed': step.failed,
          }"
          :src="getStepStatusIcon(step)"
        />
        {{ $t(step.title) }}
      </li>
    </ul>

    <img v-if="completed || error" class="action-progress-card__status-icon" :src="statusIcon" />

    <spinner v-else />

    <div class="action-progress-card__details">
      <span v-if="activeStep && !error" class="action-progress-card__details__step-description">
        {{ $t(activeStep.description) }}
      </span>

      <span v-if="error" class="action-progress-card__details__error-message">
        {{ error.message }}
      </span>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

import Spinner from '@/components/icons/Spinner.vue';
import type { ActionProgressStep } from '@/model/types';

@Component({ components: { Spinner } })
export default class ActionProgressCard extends Vue {
  @Prop({ required: true, validator: (input) => input.length > 0 })
  steps!: ActionProgressStep[];

  @Prop({ required: true, type: Boolean })
  completed!: boolean;

  @Prop({ required: false, default: null })
  error!: Error | null;

  completedIcon = require('@/assets/done.svg');
  errorIcon = require('@/assets/error.png');

  get activeStep(): ActionProgressStep | undefined {
    return this.steps.filter((step) => step.active)[0];
  }

  get statusIcon() {
    if (this.completed) {
      return this.completedIcon;
    } else if (this.error) {
      return this.errorIcon;
    } else {
      return ''; // This is in theory an error as it can't be loaded.
    }
  }

  getStepStatusIcon(step: ActionProgressStep) {
    if (step.failed) {
      return this.errorIcon;
    } else {
      return this.completedIcon;
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';

.action-progress-card {
  display: flex;
  flex-direction: column;
  align-items: center;

  &__step-list {
    padding: 0;
    margin-bottom: 20px;
    list-style-type: none;

    &__step {
      display: flex;
      align-items: center;
      color: $disabled-text-color;

      &--active {
        color: white;
        font-weight: bold;
      }

      &--completed {
        color: white;
      }

      &--failed {
        color: $error-color !important;
      }

      &__status-icon {
        height: 15px;
        margin-right: 8px;
        filter: grayscale(1) brightness(1.2);

        &--completed,
        &--failed {
          filter: none;
        }
      }
    }
  }

  &__status-icon {
    height: 120px;
    width: 120px;
  }

  &__details {
    margin-top: 20px;
    min-height: 25px;
    text-align: center;

    &__error-message {
      color: $error-color;
    }
  }
}
</style>
