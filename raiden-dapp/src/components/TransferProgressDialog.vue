<template>
  <v-card class="transfer-progress-dialog">
    <v-btn icon class="transfer-progress-dialog__close" @click="dismiss">
      <v-icon>mdi-close</v-icon>
    </v-btn>
    <v-card-text>
      <v-row
        class="transfer-progress-dialog__title"
        align="center"
        justify="center"
      >
        <v-col cols="12">
          <span v-if="error">
            {{ $t('transfer.error.title') }}
          </span>
          <span v-else-if="inProgress">
            {{ $t('transfer.steps.transfer.title') }}
          </span>
          <span v-else>
            {{ $t('transfer.steps.done.title') }}
          </span>
        </v-col>
      </v-row>
      <v-row align="center" justify="center">
        <v-col cols="6">
          <div v-if="error">
            <v-img
              :src="require('../assets/error.png')"
              class="transfer-progress-dialog--error"
            ></v-img>
          </div>
          <div v-else-if="!inProgress">
            <v-img
              :src="require('../assets/done.svg')"
              class="transfer-progress-dialog--done"
            ></v-img>
          </div>
          <v-progress-circular
            v-else
            :size="125"
            :width="4"
            color="primary"
            class="transfer-progress-dialog--progress"
            indeterminate
          ></v-progress-circular>
        </v-col>
      </v-row>
      <v-row>
        <v-col cols="12">
          <div class="transfer-progress-dialog__description">
            <span v-if="error">
              {{ error }}
            </span>
            <span v-else-if="inProgress">
              {{ $t('transfer.steps.transfer.description') }}
            </span>
            <span v-else>
              {{ $t('transfer.steps.done.description') }}
            </span>
          </div>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class TransferProgressDialog extends Vue {
  @Prop({ required: true })
  error!: string;
  @Prop({ required: true })
  inProgress!: boolean;

  @Emit()
  dismiss() {}
}
</script>

<style scoped lang="scss">
@import '../scss/colors';
.transfer-progress-dialog {
  background-color: $card-background;
  height: 441.5px;

  &__title {
    padding-top: 60px;
    text-align: center;
    font-size: 24px;
    font-weight: 500;
    letter-spacing: 0;
    color: #ffffff;
    opacity: 1;
  }

  &__description {
    text-align: center;
    font-size: 14px;
    font-weight: 400;
    letter-spacing: 0;
    color: #ffffff;
    opacity: 1;
    padding-top: 10px;
  }

  &--progress {
    margin-top: 20px;
  }

  &--done {
    margin-top: 26px;
    border-radius: 50%;
    width: 125px;
  }

  &__close {
    position: absolute;
    right: 15px;
    top: 15px;
  }
}
</style>
