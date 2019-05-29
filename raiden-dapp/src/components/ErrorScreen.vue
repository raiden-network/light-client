<template>
  <div v-if="description !== ''" class="overlay">
    <div class="card">
      <div class="header">
        <span class="header-title">Error</span>
      </div>
      <div class="card-content">
        <div class="error-title">{{ title }}</div>
        <div class="icon">
          <v-icon size="90" class="error-icon">close</v-icon>
        </div>
        <div class="error-message">{{ description }}</div>
        <div v-if="buttonLabel">
          <v-btn class="button" @click="dismiss()">{{ buttonLabel }}</v-btn>
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

.card {
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

.header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 40px;
  width: 619px;
  border-radius: 15px 15px 0 0;
  background-color: #232323;

  .header-title {
    height: 19px;
    width: 36px;
    color: #ffffff;
    font-family: Roboto, sans-serif;
    font-size: 16px;
    font-weight: bold;
    line-height: 19px;
  }
}

.card-content {
  padding-right: 40px;
  padding-left: 40px;
  height: calc(100% - 40px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
}

.icon {
  height: 100px;
  width: 100px;
  background-color: #696969;
  border-radius: 50%;
}

.error-icon {
  color: #fbfbfb;
  height: 100px;
  width: 100px;
}

.error-title {
  width: 60%;
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 40px;
  font-weight: bold;
  line-height: 47px;
  text-align: center;
}

.error-message {
  width: 60%;
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

.button {
  height: 40px;
  width: 225px;
  border-radius: 29px;
  background-color: #000000;
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
