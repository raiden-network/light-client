<template>
  <raiden-dialog width="472" class="wallet-connect-provider" :visible="true" @close="cancel">
    <span class="wallet-connect-provider__header">
      {{ $t('connection-manager.dialogs.wallet-connect-provider.header') }}
    </span>

    <div class="wallet-connect-provider__bridge-server">
      <div class="wallet-connect-provider__bridge-server__details">
        <div class="wallet-connect-provider__bridge-server__details__info">
          <h3>
            {{ $t('connection-manager.dialogs.wallet-connect-provider.bridge-server-header') }}
          </h3>
          <span>
            {{ $t('connection-manager.dialogs.wallet-connect-provider.bridge-server-body') }}
          </span>
        </div>
        <v-switch
          class="wallet-connect-provider__bridge-server__details__toggle"
          @change="toggleBridgeServerInputVisibility"
        />
      </div>
      <input
        class="wallet-connect-provider__input"
        type="text"
        :value="bridgeServerUrl"
        :placeholder="
          $t('connection-manager.dialogs.wallet-connect-provider.placeholder.bridge-server')
        "
        :disabled="bridgeServerUrlInputDisabled"
        @input="bridgeServerUrl = $event.target.value"
      />
    </div>

    <div class="wallet-connect-provider__infura-or-rpc">
      <v-btn-toggle mandatory>
        <v-btn class="wallet-connect-provider__infura-or-rpc__button" @click="showInfura">
          {{ $t('connection-manager.dialogs.wallet-connect-provider.infura-button') }}
        </v-btn>
        <v-btn class="wallet-connect-provider__infura-or-rpc__button" @click="showRpc">
          {{ $t('connection-manager.dialogs.wallet-connect-provider.rpc-button') }}
        </v-btn>
      </v-btn-toggle>

      <div class="wallet-connect-provider__infura-or-rpc__details">
        <div v-if="infuraVisible" class="wallet-connect-provider__infura-or-rpc__details--infura">
          <h3>{{ $t('connection-manager.dialogs.wallet-connect-provider.infura-header') }}</h3>
          <span>{{ $t('connection-manager.dialogs.wallet-connect-provider.infura-body') }}</span>
        </div>
        <div v-if="rpcVisible" class="wallet-connect-provider__infura-or-rpc__details--rpc">
          <h3>{{ $t('connection-manager.dialogs.wallet-connect-provider.rpc-header') }}</h3>
          <span>{{ $t('connection-manager.dialogs.wallet-connect-provider.rpc-body') }}</span>
        </div>

        <input
          class="wallet-connect-provider__input"
          type="text"
          :value="infuraIdOrRpcUrl"
          :placeholder="infuraIdOrRpcUrlInputPlaceholder"
          @input="infuraIdOrRpcUrl = $event.target.value"
        />
      </div>

      <action-button
        :enabled="canConnect"
        class="wallet-connect-provider__button"
        :text="$t('connection-manager.dialogs.wallet-connect-provider.connect-button')"
        @click="connect"
      />
    </div>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';

import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';

enum InfuraOrRpcToggleState {
  INFURA = 'infura',
  RPC = 'rpc',
}

@Component({
  components: {
    RaidenDialog,
    ActionButton,
  },
})
export default class WalletConnectProviderDialog extends Vue {
  bridgeServerUrl = '';
  bridgeServerUrlInputDisabled = true;
  infuraIdOrRpcUrl = '';
  infuraOrRpcToggleState = InfuraOrRpcToggleState.INFURA;

  @Emit()
  connect(): void {
    // pass
  }

  @Emit()
  cancel(): void {
    // pass
  }

  get infuraVisible(): boolean {
    return this.infuraOrRpcToggleState === InfuraOrRpcToggleState.INFURA;
  }

  get rpcVisible(): boolean {
    return this.infuraOrRpcToggleState === InfuraOrRpcToggleState.RPC;
  }

  get infuraIdOrRpcUrlInputPlaceholder(): string {
    const kind = this.infuraOrRpcToggleState.toString();
    return this.$t(
      `connection-manager.dialogs.wallet-connect-provider.placeholder.${kind}`,
    ) as string;
  }

  showInfura(): void {
    this.infuraOrRpcToggleState = InfuraOrRpcToggleState.INFURA;
  }

  showRpc(): void {
    this.infuraOrRpcToggleState = InfuraOrRpcToggleState.RPC;
  }

  toggleBridgeServerInputVisibility(): void {
    this.bridgeServerUrlInputDisabled = !this.bridgeServerUrlInputDisabled;
  }

  get canConnect(): boolean {
    return this.infuraIdOrRpcUrl.length > 0;
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/mixins';
@import '@/scss/colors';

.wallet-connect-provider {
  display: flex;

  &__header {
    font-size: 26px;
    margin-top: 12px;
    text-align: center;
  }

  &__input {
    background-color: $input-background;
    border-radius: 8px;
    color: $color-gray;
    height: 36px;
    margin-top: 8px;
    padding: 8px 8px 8px 16px;
    width: 100%;

    &:disabled {
      opacity: 30%;
    }
  }

  &__bridge-server {
    background-color: $input-background;
    border-radius: 8px !important;
    margin-top: 22px;
    margin-bottom: 22px;
    padding: 16px;
    width: 422px;
    @include respond-to(handhelds) {
      width: 100%;
    }

    &__details {
      color: $color-gray;
      display: flex;

      &__info {
        display: flex;
        flex: 1;
        flex-direction: column;
        font-size: 14px;
        margin-right: 82px;
        @include respond-to(handhelds) {
          margin-right: 22px;
        }
      }

      &__toggle {
        height: 32px;
      }
    }
  }

  &__infura-or-rpc {
    align-items: center;
    display: flex;
    flex-direction: column;

    &__button {
      width: 92px;
    }

    &__details {
      background-color: $input-background;
      border-radius: 8px !important;
      color: $color-gray;
      display: flex;
      flex-direction: column;
      font-size: 14px;
      margin-top: 22px;
      padding: 16px;
      width: 422px;
      @include respond-to(handhelds) {
        width: 100%;
      }
    }
  }

  &__button {
    margin-top: 86px;
    width: 100%;
    @include respond-to(handhelds) {
      margin-top: 22px;
    }

    ::v-deep {
      .v-btn {
        @include respond-to(handhelds) {
          width: 200px;
        }
      }
    }
  }
}
</style>
