<template>
  <raiden-dialog :visible="visible" @close="cancel">
    <v-card-title v-if="!error">
      {{
        $t(
          mainnet
            ? 'udc-deposit-dialog.button-main'
            : 'udc-deposit-dialog.button'
        )
      }}
    </v-card-title>
    <v-card-text>
      <v-row v-if="!loading && !error" justify="center" no-gutters>
        <v-col cols="6">
          <v-text-field
            v-model="amount"
            autofocus
            type="text"
            :suffix="serviceToken"
            class="udc-deposit-dialog__amount"
          />
        </v-col>
      </v-row>
      <v-row v-else-if="error">
        <error-message :error="error" />
      </v-row>
      <v-row v-else class="udc-deposit-dialog--progress">
        <v-col cols="12">
          <v-row no-gutters align="center" justify="center">
            <v-progress-linear color="primary" indeterminate />
          </v-row>
          <v-row no-gutters align="center" justify="center">
            <span v-if="step === 'mint'">
              {{
                $t('udc-deposit-dialog.progress.mint', {
                  currency: serviceToken
                })
              }}
            </span>
            <span v-else-if="step === 'approve'">
              {{
                $t('udc-deposit-dialog.progress.approve', {
                  currency: serviceToken
                })
              }}
            </span>
            <span v-else-if="step === 'deposit'">
              {{
                $t('udc-deposit-dialog.progress.deposit', {
                  currency: serviceToken
                })
              }}
            </span>
          </v-row>
        </v-col>
      </v-row>
      <v-row v-if="!loading && !error" class="udc-deposit-dialog__available">
        {{
          $t('udc-deposit-dialog.available', {
            balance: accountBalance,
            currency: $t('app-header.currency')
          })
        }}
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
import { mapGetters, mapState } from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import { BalanceUtils } from '@/utils/balance-utils';
import { Token } from '@/model/types';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import { RaidenError } from 'raiden-ts';

@Component({
  components: { ActionButton, RaidenDialog, ErrorMessage },
  computed: {
    ...mapState(['accountBalance']),
    ...mapGetters(['mainnet', 'udcToken'])
  }
})
export default class UdcDepositDialog extends Vue {
  amount: string = '10';
  loading: boolean = false;
  error: Error | RaidenError | null = null;

  step: 'mint' | 'approve' | 'deposit' | '' = '';

  @Prop({ required: true, type: Boolean })
  visible!: boolean;

  mainnet!: boolean;
  udcToken!: Token;

  get serviceToken(): string {
    return this.udcToken.symbol ?? (this.mainnet ? 'RDN' : 'SVT');
  }

  get valid(): boolean {
    return /^[1-9]\d*$/.test(this.amount);
  }

  @Emit()
  cancel() {
    this.error = null;
  }

  async udcDeposit() {
    this.error = null;
    this.loading = true;
    const token = this.udcToken;
    const depositAmount = BalanceUtils.parse(this.amount, token.decimals!);

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

  &__available {
    text-align: center;
  }

  &--progress {
    margin-top: 20px;
    span {
      margin-top: 22px;
    }
  }

  &__close {
    position: absolute;
    right: 15px;
    top: 15px;
  }
}
</style>
