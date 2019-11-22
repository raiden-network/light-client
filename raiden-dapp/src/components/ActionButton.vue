<template>
  <v-row
    class="action-button"
    no-gutters
    align-content="center"
    justify="center"
    :class="{ sticky: sticky }"
  >
    <v-col :cols="sticky ? 12 : 10" class="text-center">
      <v-btn
        :disabled="!enabled"
        :loading="loading"
        class="text-capitalize action-button__button"
        :class="{ sticky: sticky }"
        depressed
        large
        @click="click()"
      >
        {{ text }}
        <v-icon v-if="arrow" right>keyboard_arrow_right</v-icon>
      </v-btn>
    </v-col>
  </v-row>
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

  @Prop({ type: Boolean, default: false })
  sticky?: boolean;

  @Prop({ type: Boolean, default: false })
  arrow?: boolean;

  @Emit()
  click() {}
}
</script>
<style lang="scss" scoped>
@import '../scss/colors';

.action-button {
  &.sticky {
    margin: 0;
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
  }
}

.action-button__button {
  max-height: 40px;
  width: 250px;
  border-radius: 29px;
  background-color: $primary-color !important;

  &.sticky {
    width: 100%;
    height: 45px;
    max-height: 45px;
    font-size: 16px;
    border-radius: 0;
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;
  }
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
