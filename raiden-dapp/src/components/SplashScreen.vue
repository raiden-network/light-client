<template>
  <v-container fluid fill-height class="splash-screen">
    <v-layout align-center justify-center row>
      <v-flex xs8 md6 lg4>
        <div class="splash-screen__wrapper display-3">
          <div class="splash-screen__logo-container">
            <v-img
              :src="require('../assets/logo.svg')"
              class="splash-screen__logo"
              aspect-ratio="1"
              contain
            />
          </div>
          <div class="splash-screen__app-name">
            <div>
              {{ name }}
            </div>
          </div>
        </div>
        <div class="font-weight-light text-xs-center splash-screen__disclaimer">
          {{ $t('splash-screen.disclaimer') }}
        </div>
        <div
          class="font-weight-light text-xs-center splash-screen__matrix_sign"
        >
          {{ $t('splash-screen.matrix-sign') }}
        </div>
        <div class="splash-screen__button">
          <action-button
            :text="$t('splash-screen.connect-button')"
            v-if="injectedProvider"
            @click="connect()"
            enabled
          ></action-button>
          <span v-else class="splash-screen__no-provider">
            {{ $t('splash-screen.no-provider') }}
          </span>
        </div>
        <div class="splash-screen__message">
          <no-access-message
            v-if="accessDenied"
            :reason="accessDenied"
          ></no-access-message>
        </div>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';
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

  get injectedProvider(): boolean {
    return Web3Provider.injectedWeb3Available();
  }

  @Emit()
  connect() {}
}
</script>

<style lang="scss" scoped>
.splash-screen__logo {
  filter: invert(100%);
}

$name-horizontal-margin: 2rem;
.splash-screen__app-name {
  margin-left: $name-horizontal-margin;
  margin-right: $name-horizontal-margin;
}

.splash-screen__wrapper__logo-container {
  width: 8rem;
  padding: 1.4rem;
}

.splash-screen__wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.splash-screen__disclaimer {
  margin-top: 60px;
  font-size: 16px;
}

.splash-screen__button {
  display: flex;
  margin-top: 30px;
  align-items: center;
  justify-content: center;
}

.splash-screen__message {
  margin-top: 40px;
  height: 35px;
}

.splash-screen__no-provider {
  font-weight: 500;
  font-size: 24px;
}

.splash-screen__matrix_sign {
  margin-top: 90px;
  color: rgba(255, 255, 255, 0.8);
}
</style>
