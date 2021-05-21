<template>
  <raiden-dialog
    data-cy="channel_withdraw"
    class="channel-withdraw"
    :visible="visible"
    @close="cancel"
  >
    <v-card-title>
      {{ title }}
    </v-card-title>

    <v-card-text>
      <template v-if="loading">
        <spinner />
        <span>{{ $t('channel-withdraw.dialog.description') }}</span>
      </template>

      <template v-else-if="done">
        <v-img class="channel-withdraw__done my-4" :src="require('@/assets/done.svg')" />
        <span>{{ $t('channel-withdraw.done.description') }}</span>
      </template>

      <v-form v-else v-model="valid" @submit.prevent="withdrawTokens()">
        <amount-input
          v-model="withdraw"
          data-cy="channel_withdraw_input"
          class="channel-withdraw__input"
          :token="token"
          :max="channel.ownWithdrawable"
          limit
        />
        <action-button
          :id="`confirm-${identifier}`"
          data-cy="channel_withdraw_button"
          class="mt-8"
          :enabled="valid"
          :text="$t('channel-withdraw.buttons.confirm')"
          full-width
        />
      </v-form>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue, Watch } from 'vue-property-decorator';

import type { RaidenChannel } from 'raiden-ts';

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
export default class ChannelWithdrawDialog extends Vue {
  @Prop({ required: true })
  identifier!: number;
  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;
  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  channel!: RaidenChannel;
  @Prop({ required: true })
  loading!: boolean;
  @Prop({ required: false, default: false })
  done?: boolean;

  withdraw = '';
  valid = false;

  get title(): string {
    if (this.loading) {
      return this.$t('channel-withdraw.dialog.title') as string;
    } else if (this.done) {
      return this.$t('channel-withdraw.done.title') as string;
    } else {
      return this.$t('channel-withdraw.dialog.label') as string;
    }
  }

  @Watch('visible')
  onVisibilityChanged(visible: boolean) {
    if (!visible) {
      return;
    }
    this.updateWithdraw();
  }

  mounted() {
    this.updateWithdraw();
  }

  private async updateWithdraw() {
    this.withdraw = (this.token.decimals ?? 18) === 0 ? '0' : '0.0';
    await this.$raiden.fetchAndUpdateTokenData([this.token.address]);
  }

  @Emit()
  cancel(): boolean {
    return true;
  }

  withdrawTokens() {
    const withdraw = BalanceUtils.parse(this.withdraw, this.token.decimals!);
    if (!withdraw.isZero()) {
      this.$emit('withdraw-tokens', withdraw);
    }
  }
}
</script>

<style scoped lang="scss">
.channel-withdraw {
  &__done {
    height: 110px;
    width: 110px;
    margin: 0 auto;
  }
}
</style>
