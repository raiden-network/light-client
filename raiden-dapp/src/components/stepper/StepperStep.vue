<template>
  <v-stepper-step
    class="stepper-step"
    :class="{
      'stepper-step--active': active,
      'stepper-step--skipped': skipped,
    }"
    :complete="complete"
    :complete-icon="completeIcon"
    step
  >
    {{ title }}
  </v-stepper-step>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component
export default class StepperStep extends Vue {
  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: Boolean, required: true })
  complete!: boolean;

  @Prop({ type: Boolean, required: false, default: false })
  active!: boolean;

  @Prop({ type: Boolean, required: false, default: false })
  skipped!: boolean;

  get completeIcon(): string {
    return this.skipped ? 'mdi-redo' : 'mdi-check';
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';
@import '@/scss/mixins';

.stepper-step {
  ::v-deep {
    .v-stepper {
      &__label {
        display: block !important;
        text-align: center;

        @include respond-to(handhelds) {
          font-size: 12px;
        }
      }

      &__step {
        &__step {
          background: transparent !important;
          border: 2px solid $secondary-text-color !important;
        }
      }
    }
  }

  &--active {
    ::v-deep {
      .v-stepper {
        &__step {
          &__step {
            border-color: $primary-color !important;
            background: $primary-color !important;
          }
        }

        &__label {
          color: $primary-color;
          font-weight: bold;
        }
      }
    }
  }

  &--skipped {
    ::v-deep {
      .v-stepper {
        &__step {
          &__step {
            border-color: $secondary-text-color !important;
            background: $secondary-text-color !important;
          }
        }

        &__label {
          color: $secondary-text-color;
          font-weight: bold;
        }
      }
    }
  }
}
</style>
