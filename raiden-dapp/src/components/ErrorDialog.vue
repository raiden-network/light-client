<template>
  <v-overlay v-if="description !== ''" class="overlay" absolute="true">
    <raiden-dialog class="error-dialog bounce-animation" @close="dismiss">
      <v-row align="center" justify="center">
        <v-col cols="12">
          <div class="error-dialog__title">
            {{ title }}
          </div>
        </v-col>
      </v-row>

      <v-row align="center" justify="center">
        <v-col cols="6">
          <v-img
            class="error-dialog__image"
            :src="require('../assets/error.png')"
          ></v-img>
        </v-col>
      </v-row>

      <v-row align="center" justify="center">
        <v-col cols="12">
          <div class="error-dialog__description">
            {{ description }}
          </div>
        </v-col>
      </v-row>
    </raiden-dialog>
  </v-overlay>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import RaidenDialog from '@/components/RaidenDialog.vue';

@Component({
  components: { RaidenDialog }
})
export default class ErrorDialog extends Vue {
  @Prop({ required: true })
  title!: string;
  @Prop({ required: true })
  description!: string;

  @Emit()
  dismiss() {}
}
</script>

<style scoped lang="scss">
@import '../scss/colors';

.bounce-animation {
  animation: bounce-in 0.3s;
}
@keyframes bounce-in {
  0% {
    transform: scale(0);
  }
  50% {
    transform: scale(1.3);
  }
  100% {
    transform: scale(1);
  }
}

.overlay {
  backdrop-filter: blur(3px);
  border-radius: 10px;
  top: -120px;
}

.error-dialog {
  height: 441px;
  width: 310px;

  &__title {
    font-size: 20px;
    font-weight: 500;
    letter-spacing: 0;
    padding: 60px 0px 10px 0px;
    text-align: center;
  }

  &__image {
    height: 125px;
    width: 125px;
  }

  &__description {
    font-size: 14px;
    font-weight: 400;
    letter-spacing: 0;
    padding-top: 10px;
    text-align: center;
  }
}
</style>
