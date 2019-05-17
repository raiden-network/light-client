<template>
  <v-container fluid fill-height>
    <v-layout align-center justify-center row>
      <v-flex lg6 md8 xs10>
        <div class="loading-wrapper display-3">
          <div class="img-container">
            <v-img
              id="logo"
              aspect-ratio="1"
              contain
              :src="require('../assets/logo.svg')"
            />
          </div>
          <div id="text-information">
            <div>
              Raiden dApp
            </div>
          </div>
        </div>
        <div class="font-weight-light text-xs-center disclaimer">
          The Raiden dApp is a reference implementation of the Raiden Light
          Client SDK.<br />
          It is work in progress and can just be used on the Ethereum Testnets.
        </div>
        <div class="connect-button">
          <v-btn v-if="injectedProvider" @click="connect()">Connect</v-btn>
          <span v-else class="no-provider">
            No web3 provider was detected
          </span>
        </div>
        <div class="message-container">
          <no-access-message
            v-if="accessDenied"
            class="error-message"
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

@Component({
  components: {
    NoAccessMessage
  },
  computed: mapState(['accessDenied'])
})
export default class Loading extends Vue {
  accessDenied!: DeniedReason;
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
  margin-top: 80px;
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
</style>
