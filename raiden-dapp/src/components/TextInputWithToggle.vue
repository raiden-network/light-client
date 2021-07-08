<template>
  <div class="text-input-with-toggle">
    <h3>{{ name }}</h3>
    <span>{{ details }}</span>
    <v-switch
      v-if="optional"
      v-model="disabled"
      class="text-input-with-toggle__toggle"
      :true-value="false"
      :false-value="true"
    />
    <input
      v-model.trim="syncedValue"
      class="text-input-with-toggle__input"
      :disabled="disabled"
      :placeholder="placeholder"
    />
  </div>
</template>

<script lang="ts">
import { Component, ModelSync, Prop, Vue } from 'vue-property-decorator';

@Component
export default class TextInputWithToggle extends Vue {
  @ModelSync('value', 'input', { type: String })
  readonly syncedValue!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  details!: string;

  @Prop({ type: String, default: '' })
  placeholder!: string;

  @Prop({ type: Boolean, default: false })
  optional!: boolean;

  disabled = this.optional;

  created(): void {
    if (this.optional && this.syncedValue.length > 0) {
      this.disabled = false;
    }
  }
}
</script>

<style lang="scss">
@import '@/scss/colors';
@import '@/scss/mixins';

.text-input-with-toggle {
  position: relative; // Required for absolute toggle position.
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  color: $color-gray;
  background-color: $input-background;
  border-radius: 8px !important;
  font-size: 14px;
  text-align: left;
  margin: 20px 0;
  padding: 16px;

  @include respond-to(handhelds) {
    margin: 10px 0;
  }

  &__toggle {
    position: absolute;
    top: 0;
    right: 10px;
    height: 32px;
  }

  &__input {
    background-color: $input-background;
    border-radius: 8px;
    color: $color-gray;
    height: 36px;
    margin-top: 8px;
    padding: 8px 8px 8px 16px;
    width: 100%;

    &:disabled {
      opacity: 30%;
    }
  }
}
</style>
