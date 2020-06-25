<template>
  <v-container>
    <v-row align="center" justify="center">
      <v-col cols="12">
        <div class="withdrawal__description">
          {{ $t('withdrawal.title') }}
        </div>
      </v-col>
    </v-row>
    <v-row
      v-if="loading"
      no-gutters
      align="center"
      justify="center"
      class="withdrawal__loading"
    >
      <v-progress-linear color="primary" indeterminate />
    </v-row>
    <v-row
      v-else-if="balances.length === 0"
      class="withdrawal__empty"
      align="center"
      justify="center"
    >
      <v-col cols="auto">
        <v-row align="center" justify="center">
          <div>
            <v-img
              height="150px"
              width="150px"
              :src="require('@/assets/info.svg')"
            ></v-img>
          </div>
        </v-row>
        <v-row>
          <v-col cols="auto">{{ $t('withdrawal.no-tokens') }}</v-col>
        </v-row>
      </v-col>
    </v-row>
    <v-row v-else align="center" justify="center">
      <v-col cols="10">
        <v-list class="withdrawal__tokens" flat>
          <template v-for="(token, index) in balances">
            <v-list-item :key="token.address">
              <v-list-item-avatar class="withdrawal__tokens__icon">
                <img
                  :src="$blockie(token.address)"
                  :alt="$t('withdrawal.blockie-alt')"
                  class="indenticon"
                />
              </v-list-item-avatar>
              <v-list-item-content>
                <v-list-item-title class="withdrawal__tokens__name">
                  {{ token.name || '' }}
                </v-list-item-title>
                <v-list-item-subtitle class="withdrawal__tokens__address">
                  <address-display :address="token.address" />
                </v-list-item-subtitle>
              </v-list-item-content>
              <v-list-item-icon>
                <amount-display
                  class="withdrawal__tokens__balance"
                  :amount="token.balance"
                  :token="token"
                />
                <v-btn text icon @click="withdraw = token">
                  <v-img
                    :src="require(`@/assets/withdrawal.svg`)"
                    max-width="24px"
                    height="24px"
                    contain
                  >
                  </v-img>
                </v-btn>
              </v-list-item-icon>
            </v-list-item>
            <v-divider v-if="index < balances.length - 1" :key="index" />
          </template>
        </v-list>
      </v-col>
    </v-row>
    <raiden-dialog v-if="!!withdraw" visible @close="withdraw = null">
      <v-card-title>
        <i18n path="withdrawal.dialog.title" tag="span">
          <amount-display inline :amount="withdraw.balance" :token="withdraw" />
        </i18n>
      </v-card-title>
      <v-card-text>
        <div v-if="!withdrawing">
          <i18n path="withdrawal.dialog.body" tag="span">
            <amount-display
              inline
              :amount="withdraw.balance"
              :token="withdraw"
            />
          </i18n>
          <div
            v-if="parseFloat(raidenAccountBalance) === 0"
            class="error--text mt-2"
          >
            {{ $t('withdrawal.dialog.no-eth') }}
          </div>
        </div>
        <div v-else class="mt-4">
          <v-progress-linear color="primary" indeterminate></v-progress-linear>
          <div class="mt-4">{{ $t('withdrawal.dialog.progress') }}</div>
        </div>
      </v-card-text>
      <v-card-actions v-if="!withdrawing">
        <action-button
          class="withdrawal-dialog__action"
          :enabled="parseFloat(raidenAccountBalance) > 0"
          :text="$t('withdrawal.dialog.button')"
          @click="withdrawTokens()"
        >
        </action-button>
      </v-card-actions>
    </raiden-dialog>
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { Tokens } from '@/types';
import { Token } from '@/model/types';
import AddressDisplay from '@/components/AddressDisplay.vue';
import BlockieMixin from '@/mixins/blockie-mixin';
import AmountDisplay from '@/components/AmountDisplay.vue';
import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';

@Component({
  components: { ActionButton, RaidenDialog, AddressDisplay, AmountDisplay },
  computed: {
    ...mapState(['tokens', 'raidenAccountBalance'])
  }
})
export default class Withdrawal extends Mixins(BlockieMixin) {
  tokens!: Tokens;
  raidenAccountBalance!: string;
  balances: Token[] = [];
  loading: boolean = true;
  withdrawing: boolean = false;
  withdraw: Token | null = null;

  async mounted() {
    this.balances = await this.$raiden.getRaidenAccountBalances();
    this.loading = false;
  }

  async withdrawTokens() {
    if (!this.withdraw || !this.withdraw.balance) {
      return;
    }
    try {
      this.withdrawing = true;
      const { address, balance } = this.withdraw;
      await this.$raiden.transferOnChainTokens(address, balance);
      this.balances = this.balances.filter(token => token.address !== address);
      this.withdraw = null;
    } catch (e) {
    } finally {
      this.withdrawing = false;
    }
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.withdrawal {
  &__description {
    margin-top: 30px;
    text-align: center;
  }

  &__loading,
  &__empty {
    min-height: 490px;
  }

  &__tokens {
    margin-top: 60px;
    background-color: transparent;

    &__balance {
      margin-right: 12px;
    }

    &__address {
      ::v-deep {
        .address {
          &__label {
            color: rgba($color-white, 0.7) !important;
          }
        }
      }
    }
  }
}
</style>
