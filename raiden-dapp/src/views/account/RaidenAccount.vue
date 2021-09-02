<template>
  <div justify="center" data-cy="raiden_account" class="raiden-account">
    <v-form v-if="!loading && !error" ref="form" v-model="valid" @submit.prevent="transfer">
      <v-row class="raiden-account__title" no-gutters justify="center">
        <span v-if="isFromMainToRaidenAccount">
          {{ $t('raiden-account.transfer-from-main-account') }}
        </span>
        <span v-else>
          {{ $t('raiden-account.transfer-from-raiden-account') }}
        </span>
      </v-row>
      <v-row no-gutters justify="center">
        <v-col cols="4" md="3" class="raiden-account__column">
          <div class="raiden-account__column__card">
            <span v-if="isFromMainToRaidenAccount" class="raiden-account__column__card__title">
              {{ $t('general.main-account') }}
            </span>
            <span v-else class="raiden-account__column__card__title">
              {{ $t('general.raiden-account') }}
            </span>
            <div class="raiden-account__column__card__image">
              <v-img
                v-if="isFromMainToRaidenAccount"
                :src="require('@/assets/eth.svg')"
                width="30px"
                height="53px"
              />
              <v-img
                v-else
                class="raiden-account__column__card__image__raiden-logo"
                :src="require('@/assets/logo.svg')"
              />
            </div>
          </div>
        </v-col>
        <v-col cols="2" class="raiden-account__column" @click="toggleDirection">
          <v-btn icon>
            <v-img
              width="70px"
              height="64px"
              :src="require('../../assets/eth_transfer_arrow.svg')"
            />
          </v-btn>
        </v-col>
        <v-col cols="4" md="3" class="raiden-account__column">
          <div class="raiden-account__column__card">
            <span v-if="isFromMainToRaidenAccount" class="raiden-account__column__card__title">
              {{ $t('general.raiden-account') }}
            </span>
            <span v-else class="raiden-account__column__card__title">
              {{ $t('general.main-account') }}
            </span>
            <div class="raiden-account__column__card__image">
              <v-img
                v-if="isFromMainToRaidenAccount"
                class="raiden-account__column__card__image__raiden-logo"
                :src="require('@/assets/logo.svg')"
              />
              <v-img v-else :src="require('@/assets/eth.svg')" width="30px" height="53px" />
            </div>
          </div>
        </v-col>
      </v-row>
      <v-row no-gutters justify="center" class="raiden-account__amount-input">
        <v-col cols="8" md="7">
          <amount-input
            v-model="amount"
            data-cy="raiden_account_amount_input_field"
            class="raiden-account__amount-input__field"
            :token="token"
            :max="maximumAmount"
            limit
          />
        </v-col>
        <v-col cols="2" md="1">
          <v-btn icon class="raiden-account__amount-input__toggle" @click="toggleDirection">
            <v-icon large color="primary">mdi-autorenew</v-icon>
          </v-btn>
        </v-col>
      </v-row>
      <action-button
        data-cy="raiden_account_transfer_button_button"
        class="raiden-account__transfer-button"
        :enabled="valid"
        :text="$t('general.buttons.transfer')"
        full-width
      />
    </v-form>
    <v-row
      v-else-if="error"
      no-gutters
      class="raiden-account__error"
      justify="center"
      align="center"
    >
      <error-message :error="error" />
    </v-row>
    <v-row
      v-else
      no-gutters
      data-cy="raiden_account_progress_wrappers"
      class="raiden-account__progress-wrapper"
      justify="center"
      align="center"
    >
      <spinner />
      <p class="raiden-account__progress-hint">
        {{ $t('raiden-account.in-progress') }}
      </p>
    </v-row>
  </div>
</template>

<script lang="ts">
import type { BigNumber } from 'ethers';
import { utils } from 'ethers';
import { Component, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import AmountInput from '@/components/AmountInput.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import Spinner from '@/components/icons/Spinner.vue';
import type { Token } from '@/model/types';

@Component({
  components: { AmountInput, ActionButton, ErrorMessage, Spinner },
  computed: {
    ...mapState(['raidenAccountBalance', 'accountBalance']),
  },
})
export default class RaidenAccount extends Vue {
  isFromMainToRaidenAccount = true;
  amount = '0.0';
  loading = false;
  valid = false;
  error: Error | null = null;
  raidenAccountBalance!: string;
  accountBalance!: string;
  token: Token = {
    address: '0x1',
    decimals: 18,
    symbol: 'ETH',
    name: 'Ether',
    balance: 0,
  };

  $refs!: {
    form: HTMLFormElement;
  };

  mounted() {
    this.amount = this.currentAccountBalance();
  }

  currentAccountBalance() {
    return this.isFromMainToRaidenAccount ? this.accountBalance : this.raidenAccountBalance;
  }

  get maximumAmount(): BigNumber {
    return utils.parseEther(this.currentAccountBalance());
  }

  toggleDirection() {
    this.$refs.form.reset();
    this.isFromMainToRaidenAccount = !this.isFromMainToRaidenAccount;
    this.amount = this.currentAccountBalance();
  }

  async transfer() {
    this.loading = true;

    try {
      this.isFromMainToRaidenAccount
        ? await this.$raiden.transferToRaidenAccount(this.amount)
        : await this.$raiden.transferToMainAccount(this.amount);
    } catch (e) {
      this.error = e as Error;
    }

    this.loading = false;
    this.amount = this.currentAccountBalance();
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/mixins';
@import '@/scss/colors';

.raiden-account {
  width: 100%;

  &__title {
    font-size: 18px;
    margin-top: 50px;
    padding-bottom: 50px;
    text-align: center;
  }

  &__column {
    align-items: center;
    display: flex;
    justify-content: center;

    &__card {
      align-items: center;
      background-color: $input-background;
      border-radius: 15px;
      display: flex;
      flex-direction: column;
      height: 140px;
      width: 100%; // Required to get grid alignment

      &__title {
        padding-top: 20px;
        flex: none;
        font-size: 16px;
        text-align: center;
      }

      &__image {
        align-items: center;
        display: flex;
        flex: 1;
        justify-content: center;
        width: 30px;

        &__raiden-logo {
          filter: invert(77%) sepia(19%) saturate(6534%) hue-rotate(157deg) brightness(81%)
            contrast(91%);
        }
      }

      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    }
  }

  &__amount-input {
    align-items: center;
    display: flex;
    margin-top: 50px;

    &__toggle {
      margin-bottom: 5px;
      margin-left: 10px;
    }

    ::v-deep {
      .v-btn {
        &:active {
          .v-icon {
            animation-name: spin;
            animation-duration: 250ms;
            animation-iteration-count: infinite;
            animation-timing-function: linear;
          }
        }
      }
    }
  }

  &__error {
    margin-left: 90px;
    margin-right: 90px;
    margin-top: 70px;
  }

  &__progress-wrapper {
    flex-direction: column;
    padding-top: 40%;
    text-align: center;
  }

  &__progress-hint {
    margin-top: 30px;
  }
}
</style>
