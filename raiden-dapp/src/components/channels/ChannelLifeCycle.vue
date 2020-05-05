<template>
  <v-col class="channel-lifecycle">
    <v-row justify="center" no-gutters>
      <v-col>
        <v-stepper :value="step" class="no-shadow channel-lifecycle__stepper">
          <v-stepper-header>
            <v-stepper-step step="1">
              {{ $t('stepper.steps.open.title') }}
            </v-stepper-step>

            <v-divider :class="{ active: step > 1 }"></v-divider>

            <v-stepper-step step="2">
              {{ $t('stepper.steps.closed.title') }}
            </v-stepper-step>

            <v-divider :class="{ active: step > 2 }"></v-divider>

            <v-stepper-step step="3">
              {{ $t('stepper.steps.settleable.title') }}
            </v-stepper-step>
          </v-stepper-header>
        </v-stepper>
      </v-col>
    </v-row>
    <v-row justify="center" no-gutters>
      <v-col cols="8" class="channel-lifecycle__description">
        <div v-if="step === 1" class="channel-lifecycle__description__text">
          {{ $t('stepper.steps.open.description') }}
        </div>
        <div v-if="step === 2" class="channel-lifecycle__description__text">
          {{ $t('stepper.steps.closed.description') }}
        </div>
        <div v-if="step === 3" class="channel-lifecycle__description__text">
          {{ $t('stepper.steps.settleable.description') }}
        </div>
      </v-col>
    </v-row>
  </v-col>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { ChannelState } from 'raiden-ts';

@Component({})
export default class ChannelLifeCycle extends Vue {
  @Prop({ required: true })
  state!: ChannelState;
  get step(): number {
    let currentStep = 1;
    if (
      this.state === ChannelState.closing ||
      this.state === ChannelState.closed
    ) {
      currentStep = 2;
    } else if (
      this.state === ChannelState.settleable ||
      this.state === ChannelState.settling
    ) {
      currentStep = 3;
    }

    return currentStep;
  }
}
</script>

<style scoped lang="scss">
@import '@/main';
@import '@/scss/colors';
@import '@/scss/fonts';

$inactive-color: #646464;
$active-color: $secondary-color;
$circle-size: 20px;

.channel-lifecycle {
  &__stepper {
    background-color: transparent !important;

    .v-divider {
      margin-right: -24px;
      border-width: 2px 0 0 0;
      border-color: $inactive-color !important;

      &.active {
        border-color: $active-color !important;
      }
    }

    ::v-deep {
      .v-stepper {
        &__label {
          display: block;
          font-size: 16px;
          font-weight: bold;
          line-height: 19px;
          text-align: center;
          text-shadow: none !important;
          padding-left: 8px;
        }

        &__step {
          &__step {
            background-color: $active-color !important;
            border-color: $active-color !important;
            font-weight: bold;
            line-height: 14px;
            text-align: center;
            font-size: 12px !important;
            width: $circle-size;
            height: $circle-size;
            min-width: $circle-size;
            margin-top: -10px;
            margin-bottom: -10px;
          }

          .v-stepper {
            &__label {
              color: $active-color;
            }
          }

          &.v-stepper {
            &__step {
              &--active {
                .primary {
                  background-color: $active-color !important;
                  border-color: $active-color !important;
                }
              }

              &--inactive {
                .v-stepper {
                  &__step {
                    &__step {
                      background-color: $inactive-color !important;
                      border-color: $inactive-color !important;
                      color: #323232 !important;
                    }
                  }
                  &__label {
                    color: $inactive-color;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  &__description {
    height: 56px;
    padding-top: 8px;
    padding-bottom: 8px;

    &__text {
      color: #fafafa;
      font-family: $main-font;
      font-size: 16px;
      line-height: 21px;
      text-align: center;
    }
  }
}
</style>
