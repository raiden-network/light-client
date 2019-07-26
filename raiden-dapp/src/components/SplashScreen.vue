<template>
  <v-container fluid fill-height>
    <v-layout align-center justify-center row>
      <v-flex lg4 md6 xs8>
        <div class="loading-wrapper display-3">
          <div class="img-container">
            <v-img
              id="logo"
              :src="require('../assets/logo.svg')"
              aspect-ratio="1"
              contain
            />
          </div>
          <div id="text-information">
            <div>
              {{ name }}
            </div>
          </div>
        </div>
        <div class="font-weight-light text-xs-center disclaimer">
          {{ $t('splash-screen.disclaimer') }}
        </div>
        <div
          class="font-weight-light text-xs-center splash-screen__matrix_sign"
        >
          {{ $t('splash-screen.matrix-sign') }}
        </div>
        <div class="connect-button">
          <v-btn v-if="injectedProvider" @click="connect()">
            {{ $t('splash-screen.connect-button') }}
          </v-btn>
          <span v-else class="no-provider">
            {{ $t('splash-screen.no-provider') }}
          </span>
        </div>
        <div class="message-container">
          <no-access-message
            v-if="accessDenied"
            :reason="accessDenied"
            class="error-message"
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

@Component({
  components: {
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
#logo {
  filter: invert(100%);
}

$name-horizontal-margin: 2rem;
#text-information {
  margin-left: $name-horizontal-margin;
  margin-right: $name-horizontal-margin;
}

.img-container {
  width: 8rem;
  padding: 1.4rem;
}
.loading {
  font-size: 2.5rem;
  display: flex;
}

.loading-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.disclaimer {
  margin-top: 60px;
  font-size: 16px;
}

.connect-button {
  display: flex;
  margin-top: 30px;
  align-items: center;
  justify-content: center;

  button {
    height: 40px;
    width: 250px;
    border-radius: 29px;
    background-color: #000000 !important;
  }
}

.message-container {
  margin-top: 40px;
  height: 35px;
}

.no-provider {
  font-weight: 500;
  font-size: 24px;
}

.splash-screen__matrix_sign {
  margin-top: 90px;
  color: rgba(255, 255, 255, 0.8);
}
</style>
