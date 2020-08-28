<template>
  <div class="notification-description">
    <p v-for="(phrase, index) in splitDescription" :key="index">
      <template v-if="isAddress(phrase)">
        <address-display
          class="notification-description__address"
          :address="phrase"
        />
      </template>
      <template v-else>
        {{ phrase }}
      </template>
    </p>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import AddressDisplay from '@/components/AddressDisplay.vue';

@Component({
  components: {
    AddressDisplay,
  },
})
export default class NotificationDescriptionDisplay extends Vue {
  regex = /(0x.{40})/g;
  splitDescription: string[] = [];

  @Prop({ required: true })
  description!: string;

  isAddress(address: string): boolean {
    return this.regex.test(address);
  }

  mounted() {
    this.splitDescription = this.description.split(this.regex);
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.notification-description {
  color: $secondary-text-color;
  display: flex;
  font-size: 14px;

  > p {
    padding-right: 4px;
    margin: 0;
  }

  &__address {
    color: $secondary-text-color;
    font-size: 14px;
    padding-top: 1px;
  }
}
</style>
