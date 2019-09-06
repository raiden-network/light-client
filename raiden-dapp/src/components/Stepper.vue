<template>
  <div v-if="display" class="stepper">
    <div class="stepper__card">
      <div class="stepper__card__steps">
        <div
          v-for="(step, index) in steps"
          :key="index"
          :class="{
            'stepper__card__steps__step--active': current === index && !done
          }"
          class="stepper__card__steps__step"
        >
          <span class="stepper__card__steps__step__label">
            {{ step.label }}
          </span>
        </div>
        <div
          :class="{ 'stepper__card__steps__step--active': done }"
          class="stepper__card__steps__step"
        >
          {{ doneStep.label }}
        </div>
      </div>
      <div class="stepper__card__content">
        <div class="stepper__card__content__title">
          <span v-if="done">
            {{ doneStep.title }}
          </span>
          <span v-else>{{ steps[current].title }}</span>
        </div>
        <div v-if="done">
          <v-img
            :src="require('../assets/done.svg')"
            class="stepper__card__content--done"
          ></v-img>
        </div>
        <v-progress-circular
          v-else
          :size="110"
          :width="7"
          class="stepper__card__content--progress"
          indeterminate
        ></v-progress-circular>
        <p class="stepper__card__content__description">
          <span v-if="done">
            {{ doneStep.description }}
          </span>
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
export default class Stepper extends Vue {
  @Prop({ required: true })
  display!: boolean;

  @Prop({ required: false, default: 0 })
  current!: number;

  @Prop({ required: true })
  steps!: StepDescription[];

  @Prop({ required: true })
  doneStep!: StepDescription;

  @Prop({})
  done?: boolean;
}
</script>

<style lang="scss" scoped>
@import '../main';
@import '../scss/colors';
.stepper {
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

.stepper__card {
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

.stepper__card__content {
  padding-right: 120px;
  padding-left: 120px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
}

.stepper__card__content__title {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 32px;
  font-weight: bold;
  line-height: 38px;
  text-align: center;
}

.stepper__card__content__description {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
  margin-top: 2rem;
}

.stepper__card__steps {
  width: 100%;
  align-items: center;
  justify-content: space-evenly;
  height: 40px;
  display: flex;
  flex-direction: row;
}

.stepper__card__steps__step {
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
  position: relative;
  &:before {
    content: '';
    position: absolute;
    z-index: 1;
    right: -16px;
    height: 28px;
    width: 28px;
    background: inherit;
    border: inherit;
    border-width: 2px 2px 0 0;
    border-left-color: transparent;
    border-bottom-color: transparent;
    border-radius: 0 !important;
    transform: rotate(45deg);
  }
}

.stepper__card__steps__step__label {
  padding-left: 18px;
}

.stepper__card__steps__step:first-child {
  border-bottom-left-radius: 0;
  border-top-left-radius: 14px;
}

.stepper__card__steps__step:last-child {
  border-bottom-right-radius: 0;
  border-top-right-radius: 14px;
  &:before {
    content: '';
    position: absolute;
    margin-left: 0;
    height: 0; /* button_inner_height / sqrt(2) */
    width: 0; /* same as height */
    border-radius: 0 !important;
    transform: translate(-999em, -999em);
  }
}

.stepper__card__content--progress {
  color: $secondary-color;
}

.stepper__card__steps__step--active {
  color: white;
  background-color: $secondary-color;
}

.stepper__card__content--done {
  border-radius: 50%;
  width: 110px;
}
</style>
