<template>
  <v-layout class="action-button" align-center justify-center>
    <v-flex xs10 class="text-center">
      <v-btn
        :disabled="!enabled"
        @click="click()"
        :loading="loading"
        class="text-capitalize action-button__button"
        depressed
        large
      >
        {{ text }}
      </v-btn>
    </v-flex>
  </v-layout>
</template>
<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class ActionButton extends Vue {
  @Prop({ required: true, type: Boolean })
  enabled!: boolean;

  @Prop({ required: true })
  text!: string;

  @Prop({ type: Boolean, default: false })
  loading!: boolean;

  @Emit()
  click() {}
}
</script>
<style lang="scss" scoped>
@import '../scss/colors';

.action-button__button {
  max-height: 40px;
  width: 250px;
  border-radius: 29px;
  background-color: $primary-color !important;
}

::v-deep .v-btn--disabled {
  background-color: $primary-color !important;
}

.theme--dark.v-btn.v-btn--disabled:not(.v-btn--icon):not(.v-btn--text):not(.v-btn--outline) {
  background-color: $primary-disabled-color !important;
  color: $disabled-text-color !important;
}

.action-button__button:hover {
  background-color: rgba($primary-color, 0.8) !important;
}

::v-deep .v-btn {
  letter-spacing: 0 !important;
}
</style>
