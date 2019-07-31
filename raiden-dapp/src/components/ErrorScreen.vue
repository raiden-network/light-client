<template>
  <div v-if="description !== ''" class="overlay">
    <div class="error-screen">
      <div class="error-screen__header">
        <span class="error-screen__header__title">
          {{ $t('error-screen.title') }}
        </span>
      </div>
      <div class="error-screen__content">
        <div class="error-screen__content__title">{{ title }}</div>
        <div class="error-screen__content__icon">
          <v-img
            :src="require('../assets/error.png')"
            size="110"
            class="error-screen__content__icon__img"
          ></v-img>
        </div>
        <div class="error-screen__content__message">{{ description }}</div>
        <div v-if="buttonLabel">
          <v-btn @click="dismiss()" class="error-screen__content__button">{{
            buttonLabel
          }}</v-btn>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class ErrorScreen extends Vue {
  @Prop({ required: true })
  title!: string;
  @Prop({ required: true })
  description!: string;
  @Prop({ required: false, default: '' })
  buttonLabel!: string;

  @Emit()
  dismiss() {}
}
</script>

<style scoped lang="scss">
@import '../main';
@import '../scss/colors';
.overlay {
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

.error-screen {
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

.error-screen__header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 40px;
  width: 619px;
  border-radius: 15px 15px 0 0;
  background-color: $error-color;

  .error-screen__header__title {
    height: 19px;
    width: 36px;
    color: #ffffff;
    font-family: Roboto, sans-serif;
    font-size: 16px;
    font-weight: bold;
    line-height: 19px;
    text-transform: uppercase;
  }
}

.error-screen__content {
  padding-right: 40px;
  padding-left: 40px;
  height: calc(100% - 40px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
}

.error-screen__content__icon {
  height: 100px;
  width: 100px;
  background-color: #696969;
  border-radius: 50%;
}

.error-screen__content__icon__img {
  color: #fbfbfb;
  height: 100px;
  width: 100px;
}

.error-screen__content__title {
  width: 60%;
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 40px;
  font-weight: bold;
  line-height: 47px;
  text-align: center;
}

.error-screen__content__message {
  width: 60%;
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

.error-screen__content__button {
  height: 40px;
  width: 225px;
  border-radius: 29px;
  background-color: $primary-color !important;
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
</style>
