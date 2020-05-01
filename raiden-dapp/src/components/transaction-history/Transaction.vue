<template>
  <div class="transaction">
    <v-row class="transaction__item" no-gutters>
      <v-col class="transaction__item__icon" cols="2"></v-col>
      <v-col>
        <v-row no-gutters></v-row>
        <v-row no-gutters>
          {{
            direction === 'sent'
              ? $t('transaction-history.sent-title')
              : $t('transaction-history.received-title')
          }}
          <address-display :address="partner" />
        </v-row>
      </v-col>
      <v-col>
        <v-row no-gutters>{{ 'row one' }}</v-row>
        <v-row no-gutters>
          <v-chip v-if="success === undefined" x-small>
            {{ $t('transaction-history.pending-transfer') }}
          </v-chip>
          <v-chip v-else-if="success" x-small>
            {{ $t('transaction-history.successful-transfer') }}
          </v-chip>
          <v-chip v-else x-small>
            {{ $t('transaction-history.failed-transfer') }}
          </v-chip>
        </v-row>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import AddressDisplay from '@/components/AddressDisplay.vue';

@Component({
  components: {
    AddressDisplay
  }
})
export default class Transaction extends Vue {
  @Prop({ required: true })
  success!: boolean | undefined;
  @Prop({ required: true })
  direction!: string;
  @Prop({ required: true })
  timeStamp!: Date;
  @Prop({ required: true })
  partner!: string;
}
</script>

<style scoped lang="scss">
.transaction {
  &__item {
    &__icon {
    }
  }
}
</style>
