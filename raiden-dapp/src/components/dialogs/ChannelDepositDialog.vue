<template>
  <raiden-dialog
    data-cy="channel_deposit"
    class="channel-deposit"
    :visible="visible"
    @close="cancel"
  >
    <v-card-title>
      {{ title }}
    </v-card-title>

    <v-card-text>
      <template v-if="loading">
        <spinner />
        <span>{{ $t('transfer.steps.deposit.description') }}</span>
      </template>

      <template v-else-if="done">
        <v-img class="channel-deposit__done my-4" :src="require('@/assets/done.svg')" />
        <span>{{ $t('transfer.steps.deposit-done.description') }}</span>
      </template>

      <v-form v-else v-model="valid" @submit.prevent="depositTokens()">
        <amount-input
          v-model="deposit"
          data-cy="channel_deposit_input"
          class="channel-deposit__input"
          :token="token"
          :max="token.balance"
          limit
        />
        <action-button
          :id="`confirm-${identifier}`"
          data-cy="channel_deposit_button"
          class="mt-8"
          :enabled="valid"
          :text="$t('channel-deposit.buttons.confirm')"
          full-width
        />
      </v-form>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue, Watch } from 'vue-property-decorator';

import ActionButton from '@/components/ActionButton.vue';
import AmountInput from '@/components/AmountInput.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';
import type { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({
  components: {
    AmountInput,
    ActionButton,
    RaidenDialog,
    Spinner,
  },
})
export default class ChannelDepositDialog extends Vue {
  @Prop({ required: true })
  identifier!: number;
  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;
  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  loading!: boolean;
  @Prop({ required: false, default: false })
  done?: boolean;

  deposit = '';
  valid = false;

  get title(): string {
    if (this.loading) {
      return this.$t('transfer.steps.deposit.title') as string;
    } else if (this.done) {
      return this.$t('transfer.steps.deposit-done.title') as string;
    } else {
      return this.$t('transfer.steps.deposit.label') as string;
    }
  }

  @Watch('visible')
  onVisibilityChanged(visible: boolean) {
    if (!visible) {
      return;
    }
    this.updateDeposit();
  }

  mounted() {
    this.updateDeposit();
  }

  private async updateDeposit() {
    this.deposit = (this.token.decimals ?? 18) === 0 ? '0' : '0.0';
    await this.$raiden.fetchAndUpdateTokenData([this.token.address]);
  }

  @Emit()
  cancel(): boolean {
    return true;
  }

  depositTokens() {
    const deposit = BalanceUtils.parse(this.deposit, this.token.decimals!);
    if (!deposit.isZero()) {
      this.$emit('deposit-tokens', deposit);
    }
  }
}
</script>

<style scoped lang="scss">
.channel-deposit {
  &__done {
    height: 110px;
    width: 110px;
    margin: 0 auto;
  }
}
</style>
