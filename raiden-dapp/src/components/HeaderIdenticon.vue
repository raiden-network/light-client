<template>
  <div class="header-identicon">
    <v-img
      :src="$blockie(defaultAccount)"
      contain
      aspect-ratio="1"
      :class="{
        'header-identicon__blockie': defaultAccount,
        'header-identicon__blockie header-identicon__blockie__grayscale': !defaultAccount,
      }"
    />
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapState } from 'vuex';
import BlockieMixin from '@/mixins/blockie-mixin';

@Component({
  computed: {
    ...mapState(['defaultAccount']),
  },
})
export default class HeaderIdenticon extends Mixins(BlockieMixin) {
  defaultAccount!: string;
}
</script>

<style scoped lang="scss">
@import '../main';
@import '@/scss/colors';

.header-identicon {
  &__blockie {
    border-radius: 50%;
    box-sizing: border-box;
    height: 36px;
    width: 36px;
    border: 1px solid $color-white;
    background-color: $color-gray;

    &__grayscale {
      filter: grayscale(1);
    }
  }
}
</style>
