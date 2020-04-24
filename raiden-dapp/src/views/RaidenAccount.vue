<template>
  <v-row class="fill-height" justify="center" align="center">
    <v-form
      v-if="!loading && !error"
      ref="form"
      v-model="valid"
      class="raiden-account"
      @submit.prevent="transfer"
    >
      <v-row justify="center" align-content="center">
        <v-col cols="3" class="raiden-account__column">
          <span v-if="isFromMainToRaidenAccount">
            {{ $t('general.main-account') }}
          </span>
          <span v-else>
            {{ $t('general.raiden-account') }}
          </span>
        </v-col>
        <v-col cols="3" class="raiden-account__column">
          <v-btn icon x-large @click="toggleDirection">
            <v-icon x-large color="primary">mdi-autorenew</v-icon>
          </v-btn>
        </v-col>
        <v-col cols="3" class="raiden-account__column">
          <span v-if="isFromMainToRaidenAccount">
            {{ $t('general.raiden-account') }}
          </span>
          <span v-else>
            {{ $t('general.main-account') }}
          </span>
        </v-col>
      </v-row>
      <v-row justify="center">
        <v-col cols="10">
          <amount-input
            v-model="amount"
            :token="token"
            :max="maximumAmount"
            limit
          />
        </v-col>
      </v-row>
      <v-row justify="center">
        <v-col cols="10">
          <action-button
            :enabled="valid"
            :text="$t('general.buttons.transfer')"
          />
        </v-col>
      </v-row>
    </v-form>
    <div v-else-if="error" class="raiden-account__progress-wrapper">
      <error-message :error="error" />
    </div>
    <div v-else class="raiden-account__progress-wrapper">
      <v-progress-circular
        :size="125"
        :width="4"
        class="address-input__prepend"
        indeterminate
        color="primary"
      />
      <p class="raiden-account__progress-hint">
        {{ $t('raiden-account.in-progress') }}
      </p>
    </div>
  </v-row>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';

import AmountInput from '@/components/AmountInput.vue';
import ActionButton from '@/components/ActionButton.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import { Token } from '../model/types';
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
@import '../scss/colors';

.raiden-account {
  width: 100%;

  &__column {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    text-align: center;
  }

  &__progress-hint {
    margin-top: 30px;
  }

  &__progress-wrapper {
    text-align: center;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
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

  &__amount {
    font-size: 24px;
    font-weight: bold;
    color: $color-white;

    ::v-deep {
      input {
        text-align: right;
      }

      .v-input {
        &__slot {
          display: flex;
          align-items: center;

          &::before {
            border: none !important;
          }

          &::after {
            border: none !important;
          }
        }
      }

      .v-text-field {
        &__details {
          display: none;
        }

        &__suffix {
          padding-left: 8px;
          color: white;
          padding-right: 18px;
        }
      }
    }
  }
}
</style>
