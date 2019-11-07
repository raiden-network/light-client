<template>
  <v-row class="confirmation" no-gutters>
    <v-row align="center" justify="center">
      <h1 class="confirmation__text__header"><slot name="header"></slot></h1>
    </v-row>
    <v-row align="center" justify="center">
      <v-col cols="12">
        <p class="confirmation__text__message"><slot></slot></p>
      </v-col>
    </v-row>
    <v-row
      align="end"
      justify="center"
      class="confirmation__buttons"
      no-gutters
    >
      <v-btn
        :id="`cancel-${identifier}`"
        class="text-capitalize confirmation__buttons__cancel"
        @click="cancel()"
      >
        {{ $t('confirmation.buttons.cancel') }}
      </v-btn>
      <v-btn
        :id="`confirm-${identifier}`"
        class="text-capitalize confirmation__buttons__confirm"
        @click="confirm()"
      >
        {{ positiveAction }}
      </v-btn>
    </v-row>
  </v-row>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class Confirmation extends Vue {
  @Prop({ required: true })
  identifier!: number;
  @Prop({ required: true })
  positiveAction!: string;

  @Emit()
  public cancel() {}

  @Emit()
  public confirm() {}
}
</script>

<style scoped lang="scss">
@import '../scss/colors';
$background-color: #323232;
.confirmation {
  height: 252px;
  padding: 25px;
  background-color: $background-color;
  box-shadow: 10px 10px 15px 0 rgba(0, 0, 0, 0.3);
}

.confirmation__text__header {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 24px;
  font-weight: bold;
  line-height: 28px;
  text-align: center;
}

.confirmation__text__message {
  padding-top: 10px;
  text-align: center;
  height: 100%;
  color: #ffffff;
}

.confirmation__buttons {
}

.confirmation__buttons button {
  width: 135px !important;
  height: 35px !important;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
  border-radius: 29px;
  margin-left: 15px;
  margin-right: 15px;
}

.confirmation__buttons__cancel {
  background-color: transparent !important;
  border: 2px solid $primary-color;
  color: white;
}

.confirmation__buttons__confirm {
  background-color: $primary-color !important;
}
</style>
