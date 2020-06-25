<template>
  <div justify="center">
    <v-form
      v-if="!loading && !error"
      ref="form"
      v-model="valid"
      @submit.prevent="transfer"
    >
      <v-row class="raiden-account__title" no-gutters justify="center">
        <span v-if="isFromMainToRaidenAccount">
          {{ $t('raiden-account.transfer-from-main-account') }}
        </span>
        <span v-else>
          {{ $t('raiden-account.transfer-from-raiden-account') }}
        </span>
      </v-row>
      <v-row no-gutters justify="center">
        <v-col cols="3" class="raiden-account__column">
          <div class="raiden-account__column__card">
            <span
              v-if="isFromMainToRaidenAccount"
              class="raiden-account__column__card__title"
            >
              {{ $t('general.main-account') }}
            </span>
            <span v-else class="raiden-account__column__card__title">
              {{ $t('general.raiden-account') }}
            </span>
            <div class="raiden-account__column__card__image">
              <v-img
                v-if="isFromMainToRaidenAccount"
                :src="require('../../assets/eth.svg')"
                width="30px"
                height="53px"
              />
              <v-img
                v-else
                class="raiden-account__column__card__image__raiden-logo"
                :src="require('../../assets/logo.svg')"
              />
            </div>
          </div>
        </v-col>
        <v-col cols="3" class="raiden-account__column" @click="toggleDirection">
          <v-btn icon>
            <v-img
              width="90px"
              height="84px"
              :src="require('../../assets/eth_transfer_arrow.svg')"
            />
          </v-btn>
        </v-col>
        <v-col cols="3" class="raiden-account__column">
          <div class="raiden-account__column__card">
            <span
              v-if="isFromMainToRaidenAccount"
              class="raiden-account__column__card__title"
            >
              {{ $t('general.raiden-account') }}
            </span>
            <span v-else class="raiden-account__column__card__title">
              {{ $t('general.main-account') }}
            </span>
            <div class="raiden-account__column__card__image">
              <v-img
                v-if="isFromMainToRaidenAccount"
                class="raiden-account__column__card__image__raiden-logo"
                :src="require('../../assets/logo.svg')"
              />
              <v-img
                v-else
                :src="require('../../assets/eth.svg')"
                width="30px"
                height="53px"
              />
            </div>
          </div>
        </v-col>
      </v-row>
      <v-row no-gutters justify="center" class="raiden-account__amount-input">
        <amount-input
          v-model="amount"
          :token="token"
          :max="maximumAmount"
          limit
        />
        <v-btn
          icon
          large
          class="raiden-account__amount-input__toggle"
          @click="toggleDirection"
        >
          <v-icon large color="primary">mdi-autorenew</v-icon>
        </v-btn>
      </v-row>
      <v-row
        no-gutters
        justify="center"
        class="raiden-account__transfer-button"
      >
        <action-button
          full-width
          :enabled="valid"
          :text="$t('general.buttons.transfer')"
        />
      </v-row>
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
      class="raiden-account__progress-wrapper"
      justify="center"
      align="center"
    >
      <v-progress-linear color="primary" indeterminate />
      <p class="raiden-account__progress-hint">
        {{ $t('raiden-account.in-progress') }}
      </p>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';

import AmountInput from '@/components/AmountInput.vue';
import ActionButton from '@/components/ActionButton.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import { Token } from '@/model/types';
import { bigNumberify, parseEther, BigNumber } from 'ethers/utils';

@Component({
  components: { AmountInput, ActionButton, ErrorMessage },
  computed: {
    ...mapState(['raidenAccountBalance', 'accountBalance']),
    ...mapGetters(['isConnected'])
  }
})
export default class RaidenAccount extends Vue {
  isConnected!: boolean;
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
    balance: 0
  };

  mounted() {
    this.amount = this.currentAccountBalance();
  }

  currentAccountBalance() {
    return this.isFromMainToRaidenAccount
      ? this.accountBalance
      : this.raidenAccountBalance;
  }

  get maximumAmount(): BigNumber {
    return bigNumberify(parseEther(this.currentAccountBalance()));
  }

  toggleDirection() {
    // @ts-ignore
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
      this.error = e;
    }

    this.loading = false;
    this.amount = this.currentAccountBalance();
  }
}
</script>

<style scoped lang="scss">
@import '../../scss/mixins';
@import '../../scss/colors';

.raiden-account {
  width: 100%;

  &__title {
    font-size: 18px;
    margin-top: 50px;
    padding-bottom: 75px;
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
      width: 140px;

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
          filter: invert(77%) sepia(19%) saturate(6534%) hue-rotate(157deg)
            brightness(81%) contrast(91%);
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

  &__transfer-button {
    margin-top: 115px;
    margin-left: 80px;
    margin-right: 90px;
    @include respond-to(handhelds) {
      margin-left: 40px;
      margin-right: 40px;
    }

    ::v-deep {
      .col-10 {
        flex: 1;
        max-width: 100%;
      }
      .v-btn {
        border-radius: 8px;
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
