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
        enabled
        :text="$t('home.connect-button')"
        sticky
        @click="connectDialog = true"
      />
      <connect-dialog
        :connecting="connecting"
        :connecting-subkey="connectingSubkey"
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
import { ConnectOptions } from '@/types';
import { DeniedReason } from '@/model/types';
import ActionButton from '@/components/ActionButton.vue';
import ConnectDialog from '@/components/ConnectDialog.vue';
import NoTokens from '@/components/NoTokens.vue';

@Component({
  computed: {
    ...mapState(['loading', 'accessDenied']),
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
  connectingSubkey: boolean = false;
  loading!: boolean;
  accessDenied!: DeniedReason;

  get inaccessible() {
    return (
      this.connecting ||
      this.loading ||
      this.accessDenied !== DeniedReason.UNDEFINED
    );
  }

  async connect(connectOptions: ConnectOptions) {
    const stateBackup = connectOptions.uploadedState;
    let subkey = connectOptions.subkey;

    if (subkey) {
      this.connectingSubkey = true;
    } else {
      this.connecting = true;
    }

    this.$store.commit('reset');
    await this.$raiden.connect(stateBackup, subkey);
    this.connectingSubkey = false;
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
