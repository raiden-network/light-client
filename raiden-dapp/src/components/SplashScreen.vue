<template>
  <v-container class="splash-screen fill-height">
    <v-row no-gutters justify="center">
      <v-col cols="8" xl="2" lg="2" md="8" sm="8">
        <div class="splash-screen__logo-container">
          <v-img
            :src="require('../assets/logo.svg')"
            min-width="50px"
            class="splash-screen__logo"
            aspect-ratio="1"
            contain
          />
        </div>
      </v-col>
      <v-col cols="8" xl="4" lg="5" md="8" sm="8">
        <div class="splash-screen__app-name display-3">
          {{ name }}
        </div>
      </v-col>
      <v-col cols="8">
        <div class="splash-screen__disclaimer font-weight-light text-center">
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
        <div class="splash-screen__matrix-sign font-weight-light text-center">
          {{ $t('splash-screen.matrix-sign') }}
        </div>
      </v-col>
      <v-col cols="8">
        <div class="splash-screen__button">
          <action-button
            v-if="injectedProvider"
            :text="$t('splash-screen.connect-button')"
            :enabled="!connecting"
            :loading="connecting"
            @click="connect()"
          ></action-button>
          <span v-else class="splash-screen__no-provider">
            {{ $t('splash-screen.no-provider') }}
          </span>
        </div>
      </v-col>
      <v-col cols="8">
        <div class="splash-screen__message">
          <no-access-message
            v-if="accessDenied"
            :reason="accessDenied"
          ></no-access-message>
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
  name: string = 'Raiden dApp';

  @Prop({ default: false, required: true, type: Boolean })
  connecting!: boolean;

  // noinspection JSMethodCanBeStatic
  get injectedProvider(): boolean {
    return Web3Provider.injectedWeb3Available();
  }

  @Emit()
  connect() {}
}
</script>

<style lang="scss" scoped>
.splash-screen {
  ::v-deep {
    a {
      text-decoration: none;
    }
  }

  &__logo-container {
    display: flex;
    justify-content: flex-end;
    padding-right: 10px;
    @media only screen and (max-width: 1263px) {
      justify-content: center;
      padding: 0;
    }
  }

  &__logo {
    filter: invert(100%);
    max-width: 6rem;
  }

  &__app-name {
    align-items: center;
    display: flex;
    height: 100%;
    padding-left: 10px;
    white-space: nowrap;
    @media only screen and (max-width: 1263px) {
      justify-content: center;
      padding: 30px 0px 0px 0px;
    }
  }

  &__disclaimer,
  &__button {
    margin-top: 60px;
  }

  &__getting-started,
  &__matrix-sign {
    margin-top: 30px;
  }

  &__no-provider {
    display: flex;
    justify-content: center;
    font-size: 24px;
    font-weight: 500;
    text-align: center;
  }

  &__message {
    height: 35px;
    margin-top: 40px;
  }
}
</style>
