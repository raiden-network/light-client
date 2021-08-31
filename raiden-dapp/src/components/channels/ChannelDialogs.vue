<template>
  <error-dialog v-if="error" :error="error" @dismiss="dismiss" />
  <confirmation-dialog
    v-else-if="channel && action === 'close'"
    :identifier="channel.id"
    :positive-action="$t('confirmation.buttons.close')"
    :visible="visible"
    @confirm="close()"
    @cancel="dismiss()"
  >
    <template #header>
      {{ $t('channel-list.channel.close_dialog.title') }}
    </template>

    {{ $t('channel-list.channel.close_dialog.description') }}
  </confirmation-dialog>

  <confirmation-dialog
    v-else-if="channel && action === 'settle'"
    :identifier="channel.id"
    :positive-action="$t('confirmation.buttons.settle')"
    :visible="visible"
    @confirm="settle()"
    @cancel="dismiss()"
  >
    <template #header>
      {{ $t('channel-list.channel.settle_dialog.title') }}
    </template>
    {{
      $t('channel-list.channel.settle_dialog.description', {
        partner: channel.partner,
        token: channel.token,
      })
    }}
  </confirmation-dialog>

  <channel-deposit-dialog
    v-else-if="channel && action === 'deposit'"
    :token-address="token.address"
    :partner-address="channel.partner"
    @close="dismiss()"
  />

  <channel-withdraw-dialog
    v-else-if="channel && action === 'withdraw'"
    :identifier="channel.id"
    :token="token"
    :channel="channel"
    :visible="visible"
    :loading="withdrawInProgress"
    :done="false"
    @withdraw-tokens="withdraw($event)"
    @cancel="dismiss()"
  />
</template>

<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { mapGetters } from 'vuex';

import type { RaidenChannel } from 'raiden-ts';

import ChannelDepositDialog from '@/components/channels/ChannelDepositDialog.vue';
import ChannelWithdrawDialog from '@/components/dialogs/ChannelWithdrawDialog.vue';
import ConfirmationDialog from '@/components/dialogs/ConfirmationDialog.vue';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import type { Token } from '@/model/types';
import type { ChannelAction } from '@/types';

@Component({
  components: {
    ChannelDepositDialog,
    ChannelWithdrawDialog,
    ConfirmationDialog,
    ErrorDialog,
  },
  computed: {
    ...mapGetters({ getToken: 'token' }),
  },
})
export default class ChannelDialogs extends Vue {
  @Prop({ required: true })
  channel!: RaidenChannel;

  @Prop({ required: true })
  action!: ChannelAction;

  getToken!: (address: string) => Token;
  depositInProgress = false;
  withdrawInProgress = false;
  visible = true;
  error: Error | null = null;

  get token(): Token {
    return this.getToken(this.channel.token);
  }

  @Emit()
  message(message: string): string {
    return message;
  }

  @Emit()
  dismiss(id: number) {
    this.depositInProgress = false;
    this.busy([false, id]);
  }

  @Emit()
  busy(busy: [boolean, number]): [boolean, number] {
    return busy;
  }

  async deposit(deposit: BigNumber) {
    const { token, partner, id } = this.channel!;
    this.busy([true, id]);
    try {
      this.depositInProgress = true;
      await this.$raiden.deposit(token, partner, deposit);
      this.message(this.$t('channel-list.messages.deposit.success') as string);
      this.dismiss(id);
    } catch (e) {
      this.message(this.$t('channel-list.messages.deposit.failure') as string);
      this.error = e as Error;
    }
    this.busy([false, id]);
  }

  async withdraw(amount: BigNumber) {
    const { token, partner, id } = this.channel!;
    this.busy([true, id]);
    try {
      this.withdrawInProgress = true;
      await this.$raiden.withdraw(token, partner, amount);
      this.message(this.$t('channel-list.messages.withdraw.success') as string);
      this.dismiss(id);
    } catch (e) {
      this.message(this.$t('channel-list.messages.withdraw.failure') as string);
      this.error = e as Error;
    }
    this.busy([false, id]);
  }

  async close() {
    const { token, partner, id } = this.channel!;
    this.busy([true, id]);
    this.visible = false;
    try {
      await this.$raiden.closeChannel(token, partner);
      this.message(this.$t('channel-list.messages.close.success') as string);
      this.dismiss(id);
    } catch (e) {
      this.message(this.$t('channel-list.messages.close.failure') as string);
      this.error = e as Error;
    }
    this.busy([false, id]);
  }

  async settle() {
    const { token, partner, id } = this.channel!;
    this.busy([true, id]);
    this.visible = false;
    try {
      await this.$raiden.settleChannel(token, partner);
      this.message(this.$t('channel-list.messages.settle.success') as string);
      this.dismiss(id);
    } catch (e) {
      this.message(this.$t('channel-list.messages.settle.failure') as string);
      this.error = e as Error;
    }
    this.busy([false, id]);
  }
}
</script>

<style scoped></style>
