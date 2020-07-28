<template>
  <raiden-dialog :visible="visible" @close="cancel">
    <v-card-title v-if="!error">
      <div>
        {{ $t('udc-deposit-dialog.title') }}
      </div>
      <div v-if="mainnet" class="udc-deposit-dialog__balance">
        {{
          $t('udc-deposit-dialog.available-rdn', {
            utilityTokenBalance: utilityTokenAmount,
          })
        }}
      </div>
    </v-card-title>
    <v-card-text>
      <v-row v-if="!loading && !error" justify="center" no-gutters>
        <amount-input
          v-model="utilityTokenAmount"
          :token="udcToken"
          :placeholder="$t('transfer.amount-placeholder')"
        />
      </v-row>
      <v-row v-else-if="error">
        <error-message :error="error" />
      </v-row>
      <v-row v-else class="udc-deposit-dialog--progress">
        <v-col cols="12">
          <v-row>
            <spinner />
          </v-row>
          <v-row no-gutters align="center" justify="center">
            <span v-if="step === 'mint'">
              {{
                $t('udc-deposit-dialog.progress.mint', {
                  currency: udcToken.symbol,
                })
              }}
            </span>
            <span v-else-if="step === 'approve'">
              {{
                $t('udc-deposit-dialog.progress.approve', {
                  currency: udcToken.symbol,
                })
              }}
            </span>
            <span v-else-if="step === 'deposit'">
              {{
                $t('udc-deposit-dialog.progress.deposit', {
                  currency: udcToken.symbol,
                })
              }}
            </span>
          </v-row>
        </v-col>
      </v-row>
      <v-row v-if="mainnet && !loading && !error" no-gutters justify="center">
        <a
          class="udc-deposit-dialog--uniswap-url"
          :href="uniswapURL"
          target="_blank"
        >
          {{ $t('udc-deposit-dialog.uniswap-url-title') }}
        </a>
      </v-row>
    </v-card-text>
    <v-card-actions v-if="!error">
      <action-button
        arrow
        full-width
        :enabled="valid && !loading"
        :text="
          $t(
            mainnet
              ? 'udc-deposit-dialog.button-main'
              : 'udc-deposit-dialog.button'
          )
        "
        class="udc-deposit-dialog__action"
        @click="udcDeposit()"
      >
      </action-button>
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Vue, Emit, Prop } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import AmountInput from '@/components/AmountInput.vue';
import ActionButton from '@/components/ActionButton.vue';
import { BalanceUtils } from '@/utils/balance-utils';
import { Token } from '@/model/types';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import Spinner from '@/components/icons/Spinner.vue';
import { RaidenError } from 'raiden-ts';

@Component({
  components: {
    ActionButton,
    RaidenDialog,
    ErrorMessage,
    Spinner,
    AmountInput,
  },
  computed: {
    ...mapGetters(['mainnet', 'udcToken']),
  },
})
export default class UdcDepositDialog extends Vue {
  mainnet!: boolean;
  uniswapURL: string = '';
  udcToken!: Token;
  utilityTokenAmount: string = '';
  step: 'mint' | 'approve' | 'deposit' | '' = '';
  loading: boolean = false;
  error: Error | RaidenError | null = null;

  @Prop({ required: true, type: Boolean })
  visible!: boolean;

  @Emit()
  cancel() {
    this.error = null;
  }

  get valid(): boolean {
    return /^[1-9]\d*$/.test(this.utilityTokenAmount);
  }

  async mounted() {
    if (this.mainnet) {
      const mainAccountAddress =
        (await this.$raiden.getMainAccount()) ??
        (await this.$raiden.getAccount());

      this.uniswapURL = this.$t('udc-deposit-dialog.uniswap-url', {
        rdnToken: this.udcToken.address,
        mainAccountAddress: mainAccountAddress,
      }) as string;

      this.utilityTokenAmount = await this.$raiden.mainAccountUtilityTokenBalance(
        this.udcToken.address
      );
    } else {
      this.utilityTokenAmount = '10';
    }
  }

  async udcDeposit() {
    this.error = null;
    this.loading = true;
    const token = this.udcToken;
    const depositAmount = BalanceUtils.parse(
      this.utilityTokenAmount,
      token.decimals!
    );

    try {
      if (!this.mainnet && depositAmount.gt(token.balance!)) {
        this.step = 'mint';
        await this.$raiden.mint(token.address, depositAmount);
      }

      this.step = 'approve';
      await this.$raiden.depositToUDC(depositAmount, () => {
        this.step = 'deposit';
      });
      this.$emit('done');
    } catch (e) {
      this.error = e;
    }

    this.step = '';
    this.loading = false;
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';

.udc-deposit-dialog {
  background-color: #141414;
  border-radius: 10px !important;
  padding: 20px 20px 55px 20px;

  &__balance {
    font-size: 14px;
    width: 100%;
  }

  &--progress {
    margin-top: 20px;
    span {
      margin-top: 22px;
    }
  }

  &--uniswap-url {
    text-decoration: none;
  }

  &__close {
    position: absolute;
    right: 15px;
    top: 15px;
  }
}
</style>
