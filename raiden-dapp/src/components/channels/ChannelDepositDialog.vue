<template>
  <raiden-dialog data-cy="channel-deposit-dialog" visible @close="emitClose">
    <v-card-title>{{ $t('channel-deposit.title') }}</v-card-title>

    <v-card-text>
      <channel-deposit-action
        #default="{ runAction, confirmButtonLabel }"
        :title="$t('channel-deposit.title')"
        @completed="emitClose"
      >
        <channel-action-form
          :token-address="tokenAddress"
          :partner-address="partnerAddress"
          :confirm-button-label="confirmButtonLabel"
          :run-action="runAction"
          hide-token-address
          hide-partner-address
          token-amount-editable
          limit-to-token-balance
        />
      </channel-deposit-action>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

import ChannelActionForm from '@/components/channels/ChannelActionForm.vue';
import ChannelDepositAction from '@/components/channels/ChannelDepositAction.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';

@Component({ components: { ChannelActionForm, ChannelDepositAction, RaidenDialog } })
export default class extends Vue {
  @Prop({ type: String, required: true })
  tokenAddress!: string;

  @Prop({ type: String, required: true })
  partnerAddress!: string;

  @Emit('close')
  emitClose(): void {
    // pass
  }
}
</script>
