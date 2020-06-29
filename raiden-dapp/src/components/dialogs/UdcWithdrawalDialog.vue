<template>
  <raiden-dialog :visible="visible" @close="cancel">
    <v-card-title>{{ $t('udc.withdrawal') }}</v-card-title>
    <v-card-text>
      <v-row align="center" justify="center" no-gutters>
        <v-col v-if="error">
          <v-row>
            <error-message :error="error" />
          </v-row>
        </v-col>
        <v-col v-else-if="isDone" cols="12">
          <v-row align="center" justify="center">
            <v-col cols="6">
              <v-img
                class="udc-withdrawal-dialog__done"
                :src="require('@/assets/done.svg')"
              >
              </v-img>
            </v-col>
          </v-row>
          <v-row align="center" justify="center">
            <v-col cols="10"> {{ $t('udc.withdrawal-planned') }}</v-col>
          </v-row>
        </v-col>
        <v-col v-else-if="inProgress">
          <spinner class="udc-withdrawal-dialog__progress" />
        </v-col>
        <v-col v-else cols="12">
          <v-row no-gutters justify="center">
            <v-col cols="6">
              <v-text-field
                v-model="amount"
                autofocus
                type="text"
                :suffix="token.symbol"
                class="udc-withdrawal-dialog__amount"
              />
            </v-col>
            <v-col class="udc-withdrawal-dialog__asterisk" cols="1">
              <sup>
                {{ $t('udc.asterisk') }}
              </sup>
            </v-col>
          </v-row>
          <v-row no-gutters class="udc-withdrawal-dialog__available">
            {{
              $t('udc-deposit-dialog.available', {
                balance: accountBalance,
                currency: $t('app-header.currency')
              })
            }}
          </v-row>
        </v-col>
      </v-row>
    </v-card-text>
    <v-card-actions v-if="!error">
      <action-button
        :enabled="isValid"
        :text="$t('general.buttons.confirm')"
        @click="planWithdraw"
      />
    </v-card-actions>
    <v-card-text v-if="!error">
      <v-row class="udc-withdrawal-dialog__footnote" no-gutters>
        <span>
          <sup>{{ $t('udc.asterisk') }}</sup>
          {{ $t('udc.withdrawal-footnote') }}
        </span>
      </v-row>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Prop, Emit, Vue } from 'vue-property-decorator';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import ActionButton from '@/components/ActionButton.vue';
import { mapGetters } from 'vuex';
import { Token } from '@/model/types';
import { BigNumber, parseUnits } from 'ethers/utils';
import { Zero } from 'ethers/constants';
import ErrorMessage from '@/components/ErrorMessage.vue';
import Spinner from '@/components/icons/Spinner.vue';

@Component({
  components: {
    ErrorMessage,
    RaidenDialog,
    ActionButton,
    Spinner
  },
  computed: {
    ...mapGetters(['udcToken'])
  }
})
export default class UdcWithdrawalDialog extends Vue {
  amount: string = '0';
  inProgress: boolean = false;
  error: any = null;
  isDone: boolean = false;

  @Prop({ required: true, type: Boolean })
  visible!: boolean;
  @Prop({ required: true, type: String })
  accountBalance!: string;
  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  capacity!: BigNumber;

  private done() {
    this.isDone = true;
    setTimeout(() => {
      this.isDone = false;
    }, 5000);
  }

  get withdrawAmount(): BigNumber {
    let amount: BigNumber;
    try {
      amount = parseUnits(this.amount, this.token.decimals);
    } catch (e) {
      amount = Zero;
    }
    return amount;
  }

  get isValid(): boolean {
    if (this.inProgress) {
      return false;
    }
    const amount = this.withdrawAmount;
    return amount.gt(Zero) && amount.lte(this.capacity);
  }

  async planWithdraw() {
    this.inProgress = true;
    try {
      await this.$raiden.planUdcWithdraw(this.withdrawAmount);
      this.done();
    } catch (e) {
      this.error = e;
    } finally {
      this.inProgress = false;
    }
  }

  @Emit()
  cancel() {
    this.isDone = false;
    this.inProgress = false;
    this.error = '';
    this.amount = '0';
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.udc-withdrawal-dialog {
  &__progress {
    margin-bottom: 15px;
    margin-top: 15px;
    color: $secondary-color;
  }
  &__done {
    width: 110px;
    height: 110px;
  }

  &__amount {
    font-size: 20px;
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
        }
      }
    }
  }

  &__asterisk {
    align-items: center;
    color: $color-white;
    display: flex;
    margin-right: 18px;
    padding-top: 5px;
  }

  &__available {
    color: $color-white;
    margin-top: 25px;
  }

  &__footnote {
    margin-left: 5px;
  }
}
</style>
