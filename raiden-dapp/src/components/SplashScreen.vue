<template>
  <v-container class="splash-screen fill-height">
    <v-row no-gutters justify="center">
      <v-col cols="8">
        <div class="splash-screen__logo-container">
          <v-img
            :src="require('../assets/logo.svg')"
            aspect-ratio="1"
            class="splash-screen__logo"
            contain
          />
        </div>
      </v-col>
      <v-col cols="8">
        <div class="splash-screen__app-welcome text-center">
          {{ welcome }}
        </div>
        <div class="splash-screen__web3-provider text-center">
          {{ $t('splash-screen.connect.web3-provider') }}
        </div>
      </v-col>
      <template v-if="injectedProvider">
        <v-col cols="12">
          <div class="splash-screen__button">
            <action-button
              :text="$t('splash-screen.connect-button')"
              :enabled="!connecting"
              :loading="connecting"
              @click="connect()"
            >
            </action-button>
          </div>
        </v-col>
        <v-col cols="8">
          <div
            class="splash-screen__raiden-account text-center font-weight-light"
          >
            {{ $t('splash-screen.connect.divider') }}
          </div>
          <i18n
            path="splash-screen.connect.raiden-account.description"
            tag="div"
            class="splash-screen__raiden-account text-center font-weight-light"
          >
            <a @click="connect(true)">
              {{ $t('splash-screen.connect.raiden-account.link-name') }}
            </a>
          </i18n>
          <div class="splash-screen__disclaimer text-center font-weight-light">
            {{ $t('splash-screen.disclaimer') }}
          </div>
          <i18n
            path="splash-screen.getting-started.description"
            tag="div"
            class="splash-screen__getting-started font-weight-light text-center"
          >
            <a
              href="https://github.com/raiden-network/light-client#getting-started"
              target="_blank"
            >
              {{ $t('splash-screen.getting-started.link-name') }}
            </a>
          </i18n>
        </v-col>
      </template>
      <v-col v-else cols="8">
        <div class="splash-screen__no-provider text-center">
          {{ $t('splash-screen.no-provider') }}
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { Web3Provider } from '@/services/web3-provider';
import { DeniedReason } from '@/model/types';
import { mapState } from 'vuex';
import NoAccessMessage from '@/components/NoAccessMessage.vue';
import ActionButton from '@/components/ActionButton.vue';

@Component({
  components: {
    ActionButton,
    NoAccessMessage
  },
  computed: mapState(['accessDenied'])
})
export default class Loading extends Vue {
  accessDenied!: DeniedReason;
  welcome: string = 'Welcome to the Raiden dApp';

  @Prop({ default: false, required: true, type: Boolean })
  connecting!: boolean;

  // noinspection JSMethodCanBeStatic
  get injectedProvider(): boolean {
    return Web3Provider.injectedWeb3Available();
  }

  @Emit()
  connect(subkey?: true) {
    return subkey;
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/mixins';
@import '../scss/colors';

.splash-screen {
  margin-top: 40px;

  ::v-deep {
    a {
      text-decoration: none;
    }
  }

  &__logo-container {
    display: flex;
    justify-content: center;
  }

  &__logo {
    filter: invert(100%);
    max-width: 6rem;
    justify-content: center;
  }

  &__app-welcome {
    font-size: 24px;
    margin-top: 60px;
  }

  &__web3-provider {
    margin-top: 5px;
  }

  &__button {
    margin-top: 35px;
  }

  &__raiden-account {
    margin: 0 auto;
    margin-top: 20px;
    width: 245px;
  }

  &__disclaimer {
    margin: 0 auto;
    margin-top: 180px;
    max-width: 560px;
  }

  &__getting-started {
    margin-top: 20px;
  }

  &__no-provider {
    color: $error-color;
    font-size: 20px;
    font-weight: 500;
    padding-top: 35px;
  }
}
</style>
