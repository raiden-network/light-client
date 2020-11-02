<template>
  <v-container fluid data-cy="home" class="home">
    <v-row no-gutters>
      <v-col cols="12">
        <div class="home__logo-container">
          <v-img
            :src="require('../assets/logo.svg')"
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
          <a
            href="https://github.com/raiden-network/light-client#getting-started"
            target="_blank"
          >
            {{ $t('home.getting-started.link-name') }}
          </a>
        </i18n>
        <no-access-message
          v-if="accessDenied"
          :reason="accessDenied"
          class="home__no-access"
        />
      </v-col>
    </v-row>
    <action-button
      data-cy="home_connect_button"
      class="home__connect-button"
      :text="$t('home.connect-button')"
      :loading="connecting"
      :enabled="!connecting"
      sticky
      @click="connect"
    />
    <connect-dialog
      :connecting="connecting"
      :visible="connectDialog"
      :has-provider="hasProvider"
      @connect="connect"
      @close="connectDialog = false"
    />
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapState, mapGetters } from 'vuex';
import { Location } from 'vue-router';
import { RouteNames } from '@/router/route-names';
import { DeniedReason, TokenModel } from '@/model/types';
import ActionButton from '@/components/ActionButton.vue';
import ConnectDialog from '@/components/dialogs/ConnectDialog.vue';
import NoAccessMessage from '@/components/NoAccessMessage.vue';
import { Settings } from '@/types';
import { Web3Provider } from '@/services/web3-provider';
import { ConfigProvider } from '@/services/config-provider';

@Component({
  computed: {
    ...mapState(['loading', 'accessDenied', 'stateBackup', 'settings']),
    ...mapGetters(['isConnected', 'tokens']),
  },
  components: {
    ActionButton,
    ConnectDialog,
    NoAccessMessage,
  },
})
export default class Home extends Vue {
  isConnected!: boolean;
  tokens!: TokenModel[];
  connectDialog: boolean = false;
  connecting: boolean = false;
  loading!: boolean;
  accessDenied!: DeniedReason;
  stateBackup!: string;
  settings!: Settings;
  hasProvider: boolean = false;

  async created() {
    if (Web3Provider.injectedWeb3Available()) {
      this.hasProvider = true;
      return;
    }
    const configuration = await ConfigProvider.configuration();
    this.hasProvider = !!configuration.rpc_endpoint;
  }

  get navigationTarget(): Location {
    const redirectTo = this.$route.query.redirectTo as string;

    if (redirectTo) {
      return { path: redirectTo };
    } else {
      return { name: RouteNames.TRANSFER };
    }
  }

  async connect() {
    // On first time connect, show the connect dialog
    let { useRaidenAccount, isFirstTimeConnect } = this.settings;
    if (isFirstTimeConnect && useRaidenAccount) {
      this.connectDialog = true;
      return;
    }

    this.connectDialog = false;
    this.connecting = true;
    const stateBackup = this.stateBackup;

    this.$store.commit('reset');
    // Have to reset this explicitly, for some reason
    this.$store.commit('accessDenied', DeniedReason.UNDEFINED);

    await this.$raiden.connect(
      stateBackup,
      useRaidenAccount ? true : undefined
    );
    this.connecting = false;
    if (!this.accessDenied) {
      this.connectDialog = false;
      this.$router.push(this.navigationTarget);
    }
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
