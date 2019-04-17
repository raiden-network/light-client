<template>
  <div id="overlay" v-if="display">
    <div id="card">
      <div class="steps" v-if="done">
        <div class="active step">Done</div>
      </div>
      <div class="steps" v-else-if="steps.length > 1">
        <div
          v-for="(_, index) in steps"
          class="step"
          :class="{
            active: current === index
          }"
          :key="index"
        >
          Step {{ index + 1 }}
        </div>
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
          color="blue"
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
  padding-right: 40px;
  padding-left: 40px;
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
  font-size: 40px;
  font-weight: 500;
  line-height: 47px;
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
  flex-grow: 1;
  flex-basis: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

.active {
  width: 100%;
  height: 100%;
  border-radius: 14px;
  background-color: #232323;
}

$icon-size: 120px;
$icon-bg-size: $icon-size - 22px;

.success-icon {
  color: #1e96c8;
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
