<template>
  <v-btn
    type="submit"
    :disabled="!enabled"
    :loading="loading"
    :href="href"
    :download="download"
    data-cy="action_button"
    class="text-capitalize action-button"
    :class="{
      'action-button--sticky': sticky,
      'action-button--full-width': fullWidth,
      'action-button--angular': angular,
    }"
    depressed
    large
    :style="{ width, height }"
    @click="click()"
  >
    {{ text }}
    <v-icon v-if="arrow" right>keyboard_arrow_right</v-icon>
    <template v-if="loadingText" #loader>
      <div class="action-button__loading">
        <span>{{ loadingText }}</span>
        <v-progress-linear class="action-button__loading__indicator" indeterminate rounded />
      </div>
    </template>
  </v-btn>
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

  @Prop({ type: String })
  loadingText!: string;

  @Prop({ type: Boolean, default: false })
  sticky?: boolean;

  @Prop({ type: Boolean, default: false })
  arrow?: boolean;

  @Prop({ type: String, default: '250px' })
  width?: string;

  @Prop({ type: Boolean, default: false })
  fullWidth?: boolean;

  @Prop({ type: String, default: '40px' })
  height?: string;

  @Prop({ type: Boolean, default: false })
  angular?: boolean;

  @Prop({ type: String })
  href?: string;

  @Prop({ type: String })
  download?: string;

  @Emit()
  click(): boolean {
    return true;
  }
}
</script>
<style lang="scss" scoped>
@import '@/scss/colors';
@import '@/scss/mixins';

.action-button {
  border-radius: 29px;
  background-color: $primary-color !important;
  margin: auto;

  &:hover {
    background-color: rgba($primary-color, 0.8) !important;
  }

  &--full-width {
    width: 100% !important;
  }

  &--sticky {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100% !important;
    height: 45px;
    max-height: 45px;
    font-size: 16px;
    border-radius: 0;
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;

    @include respond-to(handhelds) {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }
  }

  &--angular {
    border-radius: 8px !important;
  }

  &__loading {
    display: flex;
    flex-direction: column;
    font-size: 14px;

    &__indicator {
      margin-top: 4px;
      width: 100px;
    }
  }
}

.theme {
  &--dark {
    .v-btn {
      &.v-btn {
        &--disabled {
          /* stylelint-disable */
          // can't nest class inside nesting
          &:not(.v-btn--icon) {
            &:not(.v-btn--text) {
              &:not(.v-btn--outline) {
                background-color: $primary-disabled-color !important;
                color: $disabled-text-color !important;
              }
            }
          }
          /* stylelint-enable */
        }
      }
    }
  }
}
</style>
