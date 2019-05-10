<template>
  <v-layout justify-center row>
    <v-flex>
      <v-stepper :value="step" alt-labels class="no-shadow lifecycle">
        <v-stepper-header>
          <v-stepper-step step="1">Open</v-stepper-step>

          <v-divider :class="{ active: step > 1 }"></v-divider>

          <v-stepper-step step="2">Closed</v-stepper-step>

          <v-divider :class="{ active: step > 2 }"></v-divider>

          <v-stepper-step step="3">Settleable</v-stepper-step>
        </v-stepper-header>
      </v-stepper>
    </v-flex>
  </v-layout>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { ChannelState } from 'raiden';

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
@import '../main';

$inactive-color: #1e1e1e;
$active-color: #e4e4e4;
$circle-size: 10px;
.lifecycle {
  background-color: transparent !important;
}

.lifecycle /deep/ .v-stepper__step__step {
  margin-top: 7px;
  font-size: 0 !important;
  width: $circle-size;
  height: $circle-size;
  min-width: $circle-size;
}

.lifecycle .v-divider {
  margin: 35px -83px 0;
  border-width: 2px 0 0 0;
}

.lifecycle .v-divider {
  border-color: $inactive-color !important;
}

.lifecycle .v-divider.active {
  border-color: $active-color !important;
}

.lifecycle /deep/ .v-stepper__label {
  font-size: 14px;
  line-height: 28px;
}

.lifecycle /deep/ .v-stepper__step.v-stepper__step--active .primary {
  background-color: $active-color !important;
  border-color: $active-color !important;
}

.lifecycle /deep/ .v-stepper__step.v-stepper__step .v-stepper__step__step {
  background-color: $active-color !important;
  border-color: $active-color !important;
}

.lifecycle
  /deep/
  .v-stepper__step.v-stepper__step--inactive
  .v-stepper__step__step {
  background-color: $inactive-color !important;
  border-color: $inactive-color !important;
}

.lifecycle /deep/ .v-stepper__label {
  display: block;
}
</style>
