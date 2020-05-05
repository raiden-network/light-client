<template>
  <raiden-dialog
    class="connect"
    :visible="visible"
    :hide-close="hideClose"
    @close="close"
  >
    <v-card-title>
      {{ $t('home.connect-dialog.connect-title') }}
    </v-card-title>
    <div v-if="injectedProvider">
      <div class="connect__button">
        <action-button
          :text="$t('home.connect-dialog.web3-provider')"
          :enabled="!connecting && !connectingSubkey"
          :loading="connecting"
          @click="connect(stateBackup)"
        />
      </div>
      <div class="text-center font-weight-light">
        {{ $t('home.connect-dialog.divider') }}
      </div>
      <i18n
        v-if="!connectingSubkey"
        path="home.connect-dialog.raiden-account.description"
        tag="div"
        class="connect__raiden-account text-center font-weight-light"
      >
        <a v-if="!connecting" @click="connect(stateBackup, true)">
          {{ $t('home.connect-dialog.raiden-account.link-name') }}
        </a>
        <span v-else>
          {{ $t('home.connect-dialog.raiden-account.link-name') }}
        </span>
      </i18n>
      <div v-else class="connect__raiden-account-spinner text-center">
        <v-progress-circular :size="30" :width="1" indeterminate />
      </div>
    </div>
    <no-access-message v-if="accessDenied" :reason="accessDenied" />
    <v-card-text v-if="!injectedProvider">
      <div class="text-center">
        {{ $t('home.connect-dialog.no-provider') }}
      </div>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Prop, Emit, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { Web3Provider } from '@/services/web3-provider';
import { DeniedReason } from '@/model/types';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import ActionButton from '@/components/ActionButton.vue';
import NoAccessMessage from '@/components/NoAccessMessage.vue';

@Component({
  components: {
    RaidenDialog,
    ActionButton,
    NoAccessMessage
  },
  computed: mapState(['stateBackup', 'accessDenied'])
})
export default class ConnectDialog extends Vue {
  hideClose: boolean = false;
  stateBackup!: string;
  accessDenied!: DeniedReason;

  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;
  @Prop({ default: false, required: true, type: Boolean })
  connecting!: boolean;
  @Prop({ default: false, required: true, type: Boolean })
  connectingSubkey!: boolean;

  @Emit()
  close() {}

  @Emit()
  connect(uploadedState: string, subkey?: true) {
    return { uploadedState, subkey };
  }

  get injectedProvider(): boolean {
    return Web3Provider.injectedWeb3Available();
  }
}
</script>

<style lang="scss" scoped>
.connect {
  &__button {
    margin: 45px 0 28px 0;
  }

  &__raiden-account,
  &__raiden-account-spinner {
    margin: 28px 0 45px 0;
  }
}
</style>
