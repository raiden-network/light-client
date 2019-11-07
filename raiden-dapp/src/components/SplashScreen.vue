<template>
  <v-container fluid class="splash-screen fill-height">
    <v-row align="center" justify="center" no-gutters>
      <v-col cols="4" lg="4" md="6" sm="8">
        <div class="splash-screen__wrapper display-3">
          <div class="splash-screen__logo-container">
            <v-img
              :src="require('../assets/logo.svg')"
              min-width="50px"
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
        <div class="font-weight-light text-center splash-screen__disclaimer">
          {{ $t('splash-screen.disclaimer') }}
        </div>
        <div class="font-weight-light text-center splash-screen__matrix_sign">
          {{ $t('splash-screen.matrix-sign') }}
        </div>
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
