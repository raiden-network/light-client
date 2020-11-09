<template>
  <div class="notification-description">
    <p v-for="(phrase, index) in splitDescription" :key="index">
      <template v-if="isAddress(phrase)">
        <address-display class="notification-description__address" :address="phrase" />
      </template>
      <template v-else>
        {{ phrase }}
      </template>
    </p>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Watch, Vue } from 'vue-property-decorator';
import AddressDisplay from '@/components/AddressDisplay.vue';

@Component({
  components: {
    AddressDisplay,
  },
})
export default class NotificationDescriptionDisplay extends Vue {
  addressRegEx = /(0x.[a-fA-F0-9]{1,40})/g;
  splitDescription: string[] = [];

  @Prop({ required: true })
  description!: string;

  @Watch('description', { immediate: true })
  updateSplitDescription(newDescription: string): void {
    this.splitDescription = newDescription.split(this.addressRegEx);
  }

  isAddress(address: string): boolean {
    return this.addressRegEx.test(address);
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.notification-description {
  color: $color-white;
  display: flex;
  font-size: 14px;

  > p {
    margin: 0;
  }

  &__address {
    color: $color-white;
    font-size: 14px;
    padding: 1px 4px 0 4px;
  }
}
</style>
