<template>
  <v-container fluid data-cy="home" class="home">
    <v-row no-gutters>
      <v-col cols="12">
        <div class="home__logo-container">
          <v-img
            :src="require('@/assets/logo.svg')"
            aspect-ratio="1"
            class="home__logo-container__logo"
            contain
          />
        </div>
      </v-col>
    </v-row>
    <v-row no-gutters>
      <v-col cols="12">
        <div class="home__app-welcome text-center">
          {{ $t('home.welcome') }}
        </div>
      </v-col>
    </v-row>
    <v-row no-gutters>
      <v-col cols="12">
        <div class="home__disclaimer text-center font-weight-light">
          {{ $t('home.disclaimer') }}
        </div>
        <i18n
          path="home.getting-started.description"
          tag="div"
          class="home__getting-started text-center font-weight-light"
        >
          <a href="https://github.com/raiden-network/light-client#getting-started" target="_blank">
            {{ $t('home.getting-started.link-name') }}
          </a>
        </i18n>
        <v-alert
          v-if="connectionError"
          class="home__no-access font-weight-light"
          color="error"
          icon="warning"
        >
          {{ translatedErrorCode }}
        </v-alert>
      </v-col>
    </v-row>
    <action-button
      data-cy="home_connect_button"
      class="home__connect-button"
      :text="$t('home.connect-button')"
      :loading="connecting"
      :enabled="!connecting"
      syncing
      sticky
      @click="connect"
    />
    <connection-pending-dialog v-if="connecting" @reset-connection="resetConnection" />
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import type { Location } from 'vue-router';
import { mapGetters, mapState } from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import ConnectionPendingDialog from '@/components/dialogs/ConnectionPendingDialog.vue';
import type { TokenModel } from '@/model/types';
import { ErrorCode } from '@/model/types';
import { RouteNames } from '@/router/route-names';
import { ConfigProvider } from '@/services/config-provider';
import { Web3Provider } from '@/services/web3-provider';
import type { Settings } from '@/types';

function mapRaidenServiceErrorToErrorCode(error: Error): ErrorCode {
  if (error.message && error.message.includes('No deploy info provided')) {
    return ErrorCode.UNSUPPORTED_NETWORK;
  } else if (error.message && error.message.includes('Could not replace stored state')) {
    return ErrorCode.STATE_MIGRATION_FAILED;
  } else {
    return ErrorCode.SDK_INITIALIZATION_FAILED;
  }
}

@Component({
  computed: {
    ...mapState(['isConnected', 'stateBackup', 'settings']),
    ...mapGetters(['tokens']),
  },
  components: {
    ActionButton,
    ConnectionPendingDialog,
  },
})
export default class Home extends Vue {
  isConnected!: boolean;
  tokens!: TokenModel[];
  connecting = false;
  connectionError: ErrorCode | null = null;
  stateBackup!: string;
  settings!: Settings;

  get navigationTarget(): Location {
    const redirectTo = this.$route.query.redirectTo as string;

    if (redirectTo) {
      return { path: redirectTo };
    } else {
      return { name: RouteNames.TRANSFER };
    }
  }

  get translatedErrorCode(): string {
    if (!this.connectionError) {
      return '';
    } else {
      const translationKey = `error-codes.${this.connectionError.toString()}`;
      return this.$t(translationKey) as string;
    }
  }

  async connect() {
    this.connecting = true;
    this.$store.commit('reset');
    this.connectionError = null;

    const stateBackup = this.stateBackup;
    const configuration = await ConfigProvider.configuration();
    const useRaidenAccount = this.settings.useRaidenAccount ? true : undefined;
    const ethereumProvider = await Web3Provider.provider(configuration);

    // TODO: This will become removed when we have the connection manager.
    if (!ethereumProvider) {
      this.connectionError = ErrorCode.NO_ETHEREUM_PROVIDER;
      this.connecting = false;
      return;
    }

    const ethereumNetwork = await ethereumProvider.getNetwork();

    if (ethereumNetwork.chainId === 1 && process.env.VUE_APP_ALLOW_MAINNET !== 'true') {
      this.connectionError = ErrorCode.UNSUPPORTED_NETWORK;
      this.connecting = false;
      return;
    }

    try {
      await this.$raiden.connect(
        ethereumProvider,
        configuration.private_key,
        stateBackup,
        configuration.per_network,
        useRaidenAccount,
      );
    } catch (error) {
      this.connectionError = mapRaidenServiceErrorToErrorCode(error);
      this.connecting = false;
      return
    }

    this.$store.commit('setConnected');
    this.$store.commit('clearBackupState');
    this.$router.push(this.navigationTarget);
  }

  resetConnection(): void {
    localStorage.removeItem('walletconnect');
    // There is no clean way to cancel the asynchronous connection function, therefore reload page.
    window.location.replace(window.location.origin);
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/mixins';

.home {
  height: 100%;
  width: 100%;

  ::v-deep {
    a {
      text-decoration: none;
    }
  }

  &__logo-container {
    display: flex;
    justify-content: center;

    &__logo {
      filter: invert(100%);
      max-width: 6rem;
    }
  }

  &__app-welcome {
    font-size: 24px;
    margin-top: 60px;
  }

  &__disclaimer,
  &__getting-started,
  &__no-access {
    font-size: 16px;
    line-height: 20px;
    margin: 30px 130px 0 130px;

    @include respond-to(handhelds) {
      margin: 30px 20px 0 20px;
    }
  }

  &__getting-started {
    margin-top: 20px;
  }
}
</style>
