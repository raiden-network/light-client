<template>
  <raiden-dialog :visible="true" :hide-close="true">
    <v-card-title>
      {{ $t('connection-manager.dialogs.connection-pending.title') }}
    </v-card-title>

    <v-card-text>
      <spinner :size="60" class="my-4" />
      {{ $t('connection-manager.dialogs.connection-pending.text') }}
    </v-card-text>

    <v-card-actions>
      <action-button
        :text="$t('connection-manager.dialogs.connection-pending.button')"
        :enabled="true"
        @click="resetConnection"
      />
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';

import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';

@Component({ components: { ActionButton, RaidenDialog, Spinner } })
export default class ConnectionPendingDialog extends Vue {
  @Emit('reset-connection')
  resetConnection(): void {
    // pass
  }
}
</script>
