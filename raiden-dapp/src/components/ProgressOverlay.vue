<template>
  <div v-if="display" id="overlay">
    <div id="card">
      <div class="steps">
        <div
          v-for="(step, index) in steps"
          :key="index"
          class="step"
          :class="{
            active: current === index && !done
          }"
        >
          <span class="label">{{ step.label }}</span>
        </div>
        <div class="step" :class="{ active: done }">Done</div>
      </div>
      <div class="card-content">
        <div class="step-title">
          <span v-if="done"> {{ doneStep.title }}</span>
          <span v-else>{{ steps[current].title }}</span>
        </div>
        <div v-if="done">
          <v-icon class="success-icon">check_circle</v-icon>
        </div>
        <v-progress-circular
          v-else
          :size="120"
          :width="7"
          class="progress"
          indeterminate
        ></v-progress-circular>
        <p id="message" class="step-description">
          <span v-if="done" v-html="doneStep.description"> </span>
          <span v-else>
            {{ steps[current].description }}
          </span>
        </p>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { StepDescription } from '@/model/types';

@Component({})
export default class ProgressOverlay extends Vue {
  @Prop({ required: true })
  display!: boolean;

  @Prop({ required: false, default: 0 })
  current!: number;

  @Prop({ required: true })
  steps!: StepDescription[];

  @Prop({})
  doneStep?: StepDescription;

  @Prop({})
  done?: boolean;
}
</script>

<style lang="scss" scoped>
@import '../main';
@import '../scss/colors';
#overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: fixed;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: $background-gradient;
  z-index: 9000;
}

#card {
  height: 700px;
  width: 620px;
  border-radius: 14px;
  background-color: #141414;
  box-shadow: 10px 10px 15px 0 rgba(0, 0, 0, 0.3);
  @include respond-to(handhelds) {
    height: 100vh;
    width: 100%;
    border-radius: 0;
  }
}

.card-content {
  padding-right: 120px;
  padding-left: 120px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
}

$horizontal-padding: 40px;

.horizontally-padded {
  padding-left: $horizontal-padding;
  padding-right: $horizontal-padding;
}

.step-title {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 32px;
  font-weight: bold;
  line-height: 38px;
  text-align: center;
}

.step-description {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

.steps {
  width: 100%;
  align-items: center;
  justify-content: space-evenly;
  height: 40px;
  display: flex;
  flex-direction: row;
}

.step {
  letter-spacing: 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
  text-transform: uppercase;
  color: $secondary-color;
  border: 1.5px solid $secondary-color;
  font-weight: 500;
  width: 100%;
  height: 100%;
  background-color: #0f374b;
  &:before,
  &:after {
    content: '';
    position: absolute;
    margin-left: 153px;
    height: 28px;
    width: 28px;
    background: inherit;
    border: inherit;
    border-left-color: transparent;
    border-bottom-color: transparent;
    border-radius: 0 !important;

    transform: rotate(45deg);
  }
}

.label {
  padding-left: 18px;
}

.step:first-child {
  border-bottom-left-radius: 0;
  border-top-left-radius: 14px;
}

.step:last-child {
  border-bottom-right-radius: 0;
  border-top-right-radius: 14px;
  &:before,
  &:after {
    content: '';
    position: absolute;
    margin-left: 0;
    height: 0; /* button_inner_height / sqrt(2) */
    width: 0; /* same as height */
    border-radius: 0 !important;
  }
}

.progress {
  color: $secondary-color;
}

.active {
  color: white;
  background-color: $secondary-color;
}

$icon-size: 120px;
$icon-bg-size: $icon-size - 22px;

.success-icon {
  color: $secondary-color;
  font-size: $icon-size;
  background: white;
  border-radius: 50%;
  line-height: $icon-bg-size;
  width: $icon-bg-size;
}

#message {
  color: white;
  margin-top: 2rem;
}
</style>
