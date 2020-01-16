<template>
  <div class="address__container">
    <v-tooltip bottom close-delay="1400">
      <template #activator="{ on }">
        <p class="address__label" v-on="on" @click="copy">
          {{ address | truncate(8) }}
        </p>
        <v-btn
          v-if="icon"
          id="copyBtn"
          text
          icon
          @click.native="copy"
          v-on="on"
        >
          <v-img
            :src="require('../assets/copy_icon.svg')"
            class="address__copy"
            contain
          ></v-img>
        </v-btn>
      </template>
      <span>
        {{ copied ? $t('address-display.copied') : $t('address-display.copy') }}
      </span>
    </v-tooltip>
    <textarea
      ref="copy"
      v-model="address"
      class="address__copy-area"
    ></textarea>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class AddressDisplay extends Vue {
  @Prop({ required: false, default: false })
  icon!: boolean;

  @Prop({ required: true })
  address!: string;

  copied: boolean = false;
  private timeout: number = 0;

  copy(event: MouseEvent) {
    event.stopPropagation();
    const copyArea = this.$refs.copy as HTMLTextAreaElement;
    copyArea.focus();
    copyArea.select();
    this.copied = document.execCommand('copy');

    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    this.timeout = (setTimeout(() => {
      this.copied = false;
    }, 2000) as unknown) as number;
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';

.address {
  &__container {
    color: $color-white;
    font-family: Roboto, sans-serif;
    font-size: 16px;
    line-height: 19px;
    display: flex;
    align-items: center;
  }

  &__label {
    cursor: pointer;
    margin: 0;
    border-radius: 3px;

    &:hover {
      background-color: $secondary-color;
      color: $color-white;
    }
  }

  &__copy {
    height: 12px;
    width: 12px;
  }

  &__copy-area {
    position: absolute;
    left: -999em;
  }
}
</style>
