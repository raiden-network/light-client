<template>
  <div class="transaction">
    <img class="transaction__icon" :src="iconSource" />

    <div class="transaction__details-left">
      <address-display
        class="transaction__details-left__address"
        :address="transfer.direction === 'sent' ? transfer.target : transfer.initiator"
      />

      <span class="transaction__details-left__time-stamp">
        {{ transfer.changedAt | formatDate }}
      </span>
    </div>

    <div class="transaction__details-right">
      <amount-display
        class="transaction__details-right__amount"
        exact-amount
        :amount="transfer.amount"
        :token="tokens[transfer.token]"
        :sign="amountDirectionSign"
        inline
      />

      <v-chip
        class="transaction__details-right__state"
        :color="`${transferStateColor}-chip`"
        :text-color="transferStateColor"
        x-small
      >
        {{ transferStateText }}
      </v-chip>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';

import type { RaidenTransfer } from 'raiden-ts';

import AddressDisplay from '@/components/AddressDisplay.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import type { Tokens } from '@/types';

@Component({
  components: {
    AddressDisplay,
    AmountDisplay,
  },
  computed: {
    ...mapState(['tokens']),
  },
})
export default class Transaction extends Vue {
  @Prop({ required: true })
  transfer!: RaidenTransfer;
  tokens!: Tokens;

  get iconSource() {
    return this.transfer.direction === 'sent'
      ? require('@/assets/sent_transfer.svg')
      : require('@/assets/received_transfer.svg');
  }

  get amountDirectionSign(): string {
    return this.transfer.direction === 'sent' ? '-' : '+';
  }

  get transferStateColor(): string {
    if (this.transfer.success === undefined) {
      return 'pending';
    } else if (this.transfer.success) {
      return 'success';
    } else {
      return 'failed';
    }
  }

  get transferStateText(): string {
    if (this.transfer.success === undefined) {
      return this.$t('transfer-history.pending-transfer') as string;
    } else if (this.transfer.success) {
      return this.$t('transfer-history.successful-transfer') as string;
    } else {
      return this.$t('transfer-history.failed-transfer') as string;
    }
  }
}
</script>

<style scoped lang="scss">
@import '@/main';
@import '@/scss/mixins';
@import '@/scss/colors';

.transaction {
  display: flex;
  height: 74px;

  &__icon {
    height: 35px;
    width: 35px;
    margin-right: 20px;

    @include respond-to(handhelds) {
      margin-right: 7px;
    }
  }

  &__details-left,
  &__details-right {
    display: flex;
    flex-direction: column;
  }

  &__details-left {
    margin-right: auto;

    &__address {
      display: inline;
    }

    &__time-stamp {
      color: $secondary-text-color;
      font-size: 12px;
    }
  }

  &__details-right {
    margin-top: -4px; // Awkward padding amount component makes it not aligned else

    &__amount {
      font-weight: bold;
    }

    &__state {
      ::v-deep {
        .v-chip {
          &__content {
            margin: auto;
          }
        }
      }
    }
  }
}
</style>
