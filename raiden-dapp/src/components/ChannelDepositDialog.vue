<template>
  <raiden-dialog
    class="channel-deposit"
    :visible="visible"
    :fullscreen="true"
    @close="cancel"
  >
    <v-card-title>
      <v-row align="center" justify="center">
        <v-col>
          <span v-if="loading">
            {{ $t('transfer.steps.deposit.title') }}
          </span>
          <span v-else-if="done">
            {{ $t('transfer.steps.deposit-done.title') }}
          </span>
          <span v-else>
            {{ $t('transfer.steps.deposit.label') }}
          </span>
        </v-col>
      </v-row>
    </v-card-title>

    <v-card-actions>
      <v-row v-if="loading" align="center" justify="center">
        <v-col cols="6">
          <v-progress-circular
            class="channel-deposit__progress"
            :size="110"
            :width="7"
            indeterminate
          >
          </v-progress-circular>
        </v-col>
      </v-row>
      <v-row v-else-if="done" align="center" justify="center">
        <v-col cols="6">
          <v-img
            class="channel-deposit__done"
            :src="require('../assets/done.svg')"
          ></v-img>
        </v-col>
      </v-row>
      <v-row v-else align="center" justify="center">
        <v-col>
          <v-form v-model="valid">
            <amount-input
              v-model="deposit"
              :token="token"
              :max="token.balance"
              limit
            >
            </amount-input>
          </v-form>
          <div class="channel-deposit__button">
            <action-button
              :enabled="valid"
              :text="$t('channel-deposit.buttons.confirm')"
              @click="depositTokens()"
            ></action-button>
          </div>
        </v-col>
      </v-row>
    </v-card-actions>

    <v-card-text>
      <v-row align="center" justify="center">
        <span v-if="loading">
          {{ $t('transfer.steps.deposit.description') }}
        </span>
        <span v-else-if="done">
          {{ $t('transfer.steps.deposit-done.description') }}
        </span>
      </v-row>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { Token } from '@/model/types';
import AmountInput from '@/components/AmountInput.vue';
import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/RaidenDialog.vue';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({
  components: {
    AmountInput,
    ActionButton,
    RaidenDialog
  }
})
export default class ChannelDepositDialog extends Vue {
  @Prop({ required: true })
  identifier!: number;
  @Prop({ required: true })
  visible!: boolean;
  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  loading!: boolean;
  @Prop({ required: false, default: false })
  done?: boolean;

  deposit: string = '0.0';
  valid: boolean = false;

  @Emit()
  cancel() {}

  depositTokens() {
    const deposit = BalanceUtils.parse(this.deposit, this.token.decimals!);
    if (!deposit.isZero()) {
      this.$emit('depositTokens', deposit);
    }
  }
}
</script>

<style scoped lang="scss">
@import '../scss/colors';

.channel-deposit {
  &__button {
    margin-top: 45px;
  }

  &__progress {
    color: $secondary-color;
  }

  &__done {
    height: 110px;
    margin: 0 auto;
    width: 110px;
  }
}
</style>
