<template>
  <raiden-dialog :visible="visible" @close="cancel">
    <v-card-title>{{ $t('udc.withdrawal') }}</v-card-title>
    <v-card-text>
      <v-row no-gutters justify="center">
        <v-col cols="6">
          <v-text-field
            v-model="amount"
            autofocus
            type="text"
            :suffix="serviceToken"
            class="udc-withdrawal-dialog__amount"
          />
        </v-col>
      </v-row>
      <v-row
        no-gutters
        justify="center"
        class="udc-withdrawal-dialog__available"
      >
        {{
          $t('udc-deposit-dialog.available', {
            balance: accountBalance,
            currency: $t('app-header.currency')
          })
        }}
      </v-row>
    </v-card-text>
    <v-card-actions>
      <action-button
        :enabled="Number(amount) > 0"
        :text="$t('general.buttons.confirm')"
      />
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Prop, Emit, Vue } from 'vue-property-decorator';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import ActionButton from '@/components/ActionButton.vue';

@Component({
  components: {
    RaidenDialog,
    ActionButton
  }
})
export default class UdcWithdrawalDialog extends Vue {
  amount: string = '0';

  @Prop({ required: true, type: Boolean })
  visible!: boolean;
  @Prop({ required: true, type: String })
  accountBalance!: string;
  @Prop({ required: true, type: String })
  serviceToken!: string;

  @Emit()
  cancel() {}
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.udc-withdrawal-dialog {
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
          padding-right: 18px;
        }
      }
    }
  }

  &__available {
    color: $color-white;
    margin-top: 25px;
  }
}
</style>
