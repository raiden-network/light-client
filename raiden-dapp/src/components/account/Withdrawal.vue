<template>
  <div class="withdrawal">
    <div class="withdrawal__info-box">
      <img class="mr-2 mt-1" :src="require('@/assets/info-gray.svg')" height="18px" width="18px" />

      <span>
        {{ $t('withdrawal.title') }}

        <a class="withdrawal__info-box__link" @click="navigateToUDC">
          {{ $t('withdrawal.navigation-link-title') }}
        </a>
      </span>
    </div>

    <spinner v-if="loading" class="withdrawal__loading" />

    <div
      v-else-if="balances.length === 0"
      data-cy="withdrawal_empty"
      class="withdrawal__empty"
      align="center"
      justify="center"
    >
      <v-img class="my-4" height="150px" width="150px" :src="require('@/assets/info.svg')" />
      <span>{{ $t('withdrawal.no-tokens') }}</span>
    </div>

    <v-list data-cy="withdrawal_tokens" class="withdrawal__token-list mt-4" flat>
      <template v-for="(token, index) in balances">
        <v-list-item :key="token.address" class="withdrawal__token-list__item">
          <v-list-item-avatar class="withdrawal__token-list__item__icon">
            <img
              :src="$blockie(token.address)"
              :alt="$t('withdrawal.blockie-alt')"
              class="indenticon"
            />
          </v-list-item-avatar>

          <v-list-item-content>
            <v-list-item-title class="withdrawal__token-list__item__name">
              {{ token.name || '' }}
            </v-list-item-title>
            <v-list-item-subtitle class="withdrawal__token-list__item__address">
              <address-display :address="token.address" />
            </v-list-item-subtitle>
          </v-list-item-content>

          <v-list-item-icon>
            <div
              data-cy="withdrawal_tokens_button"
              class="withdrawal__token-list__item__button"
              @click="withdraw = token"
            >
              <amount-display :amount="token.balance" :token="token" />
              <img :src="require('@/assets/icon-withdraw.svg')" />
            </div>
          </v-list-item-icon>
        </v-list-item>
        <v-divider v-if="index < balances.length - 1" :key="index" />
      </template>
    </v-list>

    <raiden-dialog v-if="!!withdraw" visible @close="withdraw = null">
      <v-card-title>
        <i18n path="withdrawal.dialog.title" tag="span">
          <amount-display inline :amount="withdraw.balance" :token="withdraw" />
        </i18n>
      </v-card-title>

      <v-card-text>
        <div v-if="!withdrawing">
          <i18n path="withdrawal.dialog.body" tag="span">
            <amount-display inline :amount="withdraw.balance" :token="withdraw" />
          </i18n>
          <div v-if="parseFloat(raidenAccountBalance) === 0" class="error--text mt-2">
            {{ $t('withdrawal.dialog.no-eth') }}
          </div>
        </div>
        <div v-else class="mt-4">
          <spinner />
          <div class="mt-4">{{ $t('withdrawal.dialog.progress') }}</div>
        </div>
      </v-card-text>

      <v-card-actions v-if="!withdrawing">
        <action-button
          data-cy="withdrawal_dialog_action"
          class="withdrawal-dialog__action"
          :enabled="parseFloat(raidenAccountBalance) > 0"
          :text="$t('withdrawal.dialog.button')"
          full-witdh
          @click="withdrawTokens()"
        />
      </v-card-actions>
    </raiden-dialog>
  </div>
</template>

<script lang="ts">
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';
import uniqBy from 'lodash/uniqBy';
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';
import BlockieMixin from '@/mixins/blockie-mixin';
import NavigationMixin from '@/mixins/navigation-mixin';
import type { Token } from '@/model/types';

@Component({
  components: {
    ActionButton,
    RaidenDialog,
    AddressDisplay,
    AmountDisplay,
    Spinner,
  },
  computed: {
    ...mapState(['raidenAccountBalance']),
    ...mapState('userDepositContract', { udcToken: 'token' }),
    ...mapGetters(['allTokens']),
  },
})
export default class Withdrawal extends Mixins(BlockieMixin, NavigationMixin) {
  allTokens!: Token[];
  raidenAccountBalance!: string;
  udcToken!: Token;
  balances: Token[] = [];
  loading = true;
  withdrawing = false;
  withdraw: Token | null = null;

  async mounted() {
    await this.$raiden.fetchAndUpdateTokenData();
    const allTokens = uniqBy(this.allTokens.concat(this.udcToken), (token) => token.address);
    const updatedTokenBalances = await Promise.all(
      allTokens.map(async (token) => ({
        ...token,
        balance: await this.$raiden.getTokenBalance(
          token.address,
          this.$store.state.defaultAccount,
        ),
      })),
    );

    this.balances = updatedTokenBalances.filter((token) =>
      (token.balance as BigNumber).gt(constants.Zero),
    );
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
      this.balances = this.balances.filter((token) => token.address !== address);
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

$background-color: #1c1c1c;
$border-radius: 8px;
$height: 72px;

.withdrawal {
  margin: 0 64px 0 64px;

  @include respond-to(handhelds) {
    margin: 0 20px 0 20px;
  }

  &__info-box {
    $color: #7a7a80;
    display: flex;
    align-items: flex-start;
    min-height: $height;
    padding: 16px;
    color: $color;
    background-color: $background-color;
    border-radius: $border-radius;
    font-size: 12px;

    &__link {
      color: $color;
      text-decoration: underline;
    }
  }

  &__loading,
  &__empty {
    min-height: 490px;
  }

  &__token-list {
    background-color: transparent;

    &__item {
      height: $height;
      background-color: $background-color;
      border-radius: $border-radius;
      font-size: 14px;
      font-weight: 500;

      &__button {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 40px;
        padding: 8px;
        border-radius: $border-radius;
        color: #44ddff;
        background-color: #182d32;

        &:hover {
          background-color: #213e45;
          cursor: pointer;
        }

        img {
          margin-left: 5px;
        }
      }

      &__address {
        ::v-deep {
          .address {
            &__label {
              font-weight: normal;
              color: #a9a9a9 !important;
            }
          }
        }
      }
    }
  }
}
</style>
