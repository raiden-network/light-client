<template>
  <confirmation-dialog
    v-if="channel && action === 'close'"
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
    :identifier="channel.id"
    :token="token(channel.token)"
    :visible="visible"
    :loading="depositInProgress"
    :done="false"
    @depositTokens="deposit($event)"
    @cancel="dismiss()"
  ></channel-deposit-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import ChannelDepositDialog from '@/components/dialogs/ChannelDepositDialog.vue';
import ConfirmationDialog from '@/components/dialogs/ConfirmationDialog.vue';
import { RaidenChannel } from 'raiden-ts';
import { BigNumber } from 'ethers/utils';
import { ChannelAction } from '@/types';
import { mapGetters } from 'vuex';
import { Token } from '@/model/types';

@Component({
  components: {
    ChannelDepositDialog,
    ConfirmationDialog,
  },
  computed: {
    ...mapGetters(['token']),
  },
})
export default class ChannelDialogs extends Vue {
  @Prop({ required: true })
  channel!: RaidenChannel | null;
  @Prop({ required: true })
  action!: ChannelAction;
  token!: (address: string) => Token;

  depositInProgress = false;
  visible = true;

  @Emit()
  message(_message: string) {}

  @Emit()
  dismiss() {
    this.depositInProgress = false;
  }

  @Emit()
  error(_error: Error) {}

  async deposit(deposit: BigNumber) {
    const { token, partner } = this.channel!;
    try {
      this.depositInProgress = true;
      await this.$raiden.deposit(token, partner, deposit);
      this.message(this.$t('channel-list.messages.deposit.success') as string);
    } catch (e) {
      this.message(this.$t('channel-list.messages.deposit.failure') as string);
      this.error(e);
    }
    this.dismiss();
  }

  async close() {
    const { token, partner } = this.channel!;
    this.visible = false;
    try {
      await this.$raiden.closeChannel(token, partner);
      this.message(this.$t('channel-list.messages.close.success') as string);
    } catch (e) {
      this.message(this.$t('channel-list.messages.close.failure') as string);
      this.error(e);
    }
    this.dismiss();
  }

  async settle() {
    const { token, partner } = this.channel!;
    this.visible = false;
    try {
      await this.$raiden.settleChannel(token, partner);
      this.message(this.$t('channel-list.messages.settle.success') as string);
    } catch (e) {
      this.message(this.$t('channel-list.messages.settle.failure') as string);
      this.error(e);
    }
    this.dismiss();
  }
}
</script>

<style scoped></style>
