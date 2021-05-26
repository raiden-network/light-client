<template>
  <div class="notification-description">
    <p v-for="(phrase, index) in splitDescription" :key="index">
      <address-display
        v-if="isAddress(phrase)"
        class="notification-description__address"
        :address="phrase"
      />
      <span v-else>{{ phrase }}</span>
    </p>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

import AddressDisplay from '@/components/AddressDisplay.vue';

const ADDRESS_REGULAR_EXPRESSION = /(0x.[a-fA-F0-9]{1,40})/g;

@Component({
  components: {
    AddressDisplay,
  },
})
export default class NotificationDescriptionDisplay extends Vue {
  @Prop({ required: true })
  description!: string;

  get splitDescription(): string[] {
    return this.description.split(ADDRESS_REGULAR_EXPRESSION);
  }

  isAddress(address: string): boolean {
    return ADDRESS_REGULAR_EXPRESSION.test(address);
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.notification-description {
  color: $color-white;
  display: flex;
  flex-wrap: wrap;
  font-size: 14px;
  white-space: pre-wrap;

  > p {
    margin: 0;
  }

  &__address {
    color: $color-white;
    font-size: 14px;
    padding-top: 1px;
  }
}
</style>
