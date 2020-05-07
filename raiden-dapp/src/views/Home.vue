<template>
  <v-container fluid class="home">
    <no-tokens v-if="!inaccessible && isConnected" />
    <div v-else>
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
        </v-col>
      </v-row>
      <action-button
        :text="$t('home.connect-button')"
        :loading="connecting"
        :enabled="!connecting"
        sticky
        @click="connect"
      />
      <connect-dialog
        :connecting="connecting"
        :visible="connectDialog"
        @connect="connect"
        @close="connectDialog = false"
      />
    </div>
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapState, mapGetters } from 'vuex';
import { DeniedReason } from '@/model/types';
import ActionButton from '@/components/ActionButton.vue';
import ConnectDialog from '@/components/dialogs/ConnectDialog.vue';
import NoTokens from '@/components/NoTokens.vue';

@Component({
  computed: {
    ...mapState(['loading', 'accessDenied', 'stateBackup']),
    ...mapGetters(['isConnected'])
  },
  components: {
    ActionButton,
    ConnectDialog,
    NoTokens
  }
})
export default class Home extends Vue {
  isConnected!: boolean;
  connectDialog: boolean = false;
  connecting: boolean = false;
  loading!: boolean;
  accessDenied!: DeniedReason;
  stateBackup!: string;

  get inaccessible() {
    return (
      this.connecting ||
      this.loading ||
      this.accessDenied !== DeniedReason.UNDEFINED
    );
  }

  async connect() {
    const settings = window.localStorage.getItem('raiden_dapp');
    debugger;
    if (!settings) {
      this.connectDialog = true;
      return;
    }
    let subkey = settings ? JSON.parse(settings).raidenAccount : undefined;
    this.connectDialog = false;
    this.connecting = true;
    this.$store.commit('reset');
    debugger;
    await this.$raiden.connect(this.stateBackup, subkey);
    this.connecting = false;
    if (!this.accessDenied) {
      this.connectDialog = false;
    }
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/mixins';

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
    margin-top: 80px;

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
  &__getting-started {
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
