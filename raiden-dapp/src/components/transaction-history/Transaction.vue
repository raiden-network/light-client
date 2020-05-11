<template>
  <div class="transaction">
    <v-row class="transaction__item" no-gutters>
      <v-col class="transaction__item__icon" cols="1">
        <v-img
          v-if="transfer.direction === 'sent'"
          height="45px"
          width="45px"
          :src="require('../../assets/sent_transfer.svg')"
        />
        <v-img
          v-else
          height="45px"
          width="45px"
          :src="require('../../assets/received_transfer.svg')"
        />
      </v-col>
      <v-col class="transaction__item__details-left">
        <v-row no-gutters>
          {{
            transfer.direction === 'sent'
              ? $t('transfer-history.sent-title')
              : $t('transfer-history.received-title')
          }}
          <address-display
            class="transaction__item__details-left__address"
            :address="transfer.partner"
          />
        </v-row>
        <v-row class="transaction__item__details-left__time-stamp" no-gutters>
          {{ new Intl.DateTimeFormat('en-US').format(transfer.changedAt) }}
          {{ transfer.changedAt.toLocaleTimeString('en-US') }}
        </v-row>
      </v-col>
      <v-col class="transaction__item__details-right">
        <v-row no-gutters>
          <div class="transaction__item__details-right__amount">
            <span class="transaction__item__details-right__amount--direction">
              {{
                transfer.direction === 'sent'
                  ? $t('transfer-history.sent-symbol')
                  : $t('transfer-history.received-symbol')
              }}
            </span>
            <amount-display
              class="transaction__item__details-right__amount--sum"
              exact-amount
              :amount="transfer.amount"
              :token="transfer.token"
            />
          </div>
        </v-row>
        <v-row no-gutters>
          <span class="transaction__item__details-right--status">
            <v-chip
              v-if="transfer.success === undefined"
              x-small
              color="rgba(253, 211, 39, 0.3)"
              text-color="#fdd327"
            >
              {{ $t('transfer-history.pending-transfer') }}
            </v-chip>
            <v-chip
              v-else-if="transfer.success"
              x-small
              color="rgba(29, 197, 18, 0.3)"
              text-color="#1dc512"
            >
              {{ $t('transfer-history.successful-transfer') }}
            </v-chip>
            <v-chip
              v-else
              x-small
              color="rgba(234, 100, 100, 0.3)"
              text-color="#ea6464"
            >
              {{ $t('transfer-history.failed-transfer') }}
            </v-chip>
          </span>
        </v-row>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Transfers } from '../../types';
import AddressDisplay from '@/components/AddressDisplay.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';

@Component({
  components: {
    AddressDisplay,
    AmountDisplay
  }
})
export default class Transaction extends Vue {
  @Prop({ required: true })
  transfer!: Transfers;
}
</script>

<style scoped lang="scss">
@import '../../scss/colors';

.transaction {
  height: 74px;

  &__item {
    &__details-left {
      margin-left: 20px;

      &__address {
        padding: 0 0 2px 5px;
      }

      &__time-stamp {
        color: $secondary-text-color;
        font-size: 10px;
      }
    }
    &__details-right {
      &__amount {
        display: flex;
        flex: 1;

        &--direction {
          flex: 1;
          font-weight: bold;
          text-align: right;
        }

        &--sum {
          flex: none;
          font-weight: bold;
        }
      }

      &--status {
        flex: 1;
        text-align: right;
      }
    }
  }
}
</style>
