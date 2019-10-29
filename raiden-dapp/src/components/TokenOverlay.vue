<template>
  <v-overlay :value="show" absolute opacity="1.0" class="token-network-overlay">
    <v-container class="container">
      <v-row no-gutters justify="end">
        <v-btn @click="cancel" icon class="close-button">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-row>

      <v-row>
        <v-col cols="12">
          <v-list class="token-list">
            <v-list-item @click="navigateToSelectHub(token.address)">
              <v-col cols="2">
                <v-list-item-avatar>
                  <v-btn class="mx-2" fab dark small color="primary">
                    <v-icon dark large>mdi-plus</v-icon>
                  </v-btn>
                </v-list-item-avatar>
              </v-col>
              <v-col cols="10" align-self="center" class="connect-new-token">
                {{ $t('tokens.connect-new') }}
              </v-col>
            </v-list-item>
          </v-list>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="2" align-self="center"></v-col>
        <v-col cols="10" align-self="center" class="header">
          {{ $t('tokens.connected.header') }}
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12">
          <v-list v-for="(token, i) in tokens" :key="i" class="token-list">
            <v-list-item
              :key="token.address"
              @click="navigateToSelectHub(token.address)"
            >
              <v-col cols="2">
                <v-list-item-avatar>
                  <img
                    :src="$blockie(token.address)"
                    :src-lazy="require('../assets/generic.svg')"
                    :alt="$t('select-token.tokens.token.blockie-alt')"
                  />
                </v-list-item-avatar>
              </v-col>
              <v-col cols="8">
                <v-list-item-content>
                  <v-list-item-title class="token-title">
                    {{
                      $t('select-token.tokens.token.token-information', {
                        symbol: token.symbol,
                        name: token.name
                      })
                    }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="token-address">
                    <v-tooltip bottom>
                      <template #activator="{ on }">
                        <span v-on="on">{{ token.address | truncate }}</span>
                      </template>
                      <span>{{ token.address }}</span>
                    </v-tooltip>
                  </v-list-item-subtitle>
                </v-list-item-content>
              </v-col>
              <v-col cols="2">
                <v-list-item-action-text>
                  <span class="token-balance">
                    {{ getBalance(token) }}
                  </span>
                </v-list-item-action-text>
              </v-col>
            </v-list-item>
          </v-list>
        </v-col>
      </v-row>
    </v-container>
  </v-overlay>
</template>

<script lang="ts">
import { Component, Mixins, Prop, Emit } from 'vue-property-decorator';
import { mapGetters } from 'vuex';

import BlockieMixin from '@/mixins/blockie-mixin';
import { TokenModel, Token } from '../model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import Filters from '@/filters';

@Component({
  computed: {
    ...mapGetters(['tokens', 'allTokens'])
  }
})
export default class Payment extends Mixins(BlockieMixin) {
  @Prop({ required: true, type: Boolean })
  show!: boolean;

  allTokens!: Token[];
  tokens!: TokenModel[];

  getBalance(token: TokenModel) {
    const { balance, decimals } = this.$store.getters.token(token.address);
    return Filters.displayFormat(balance, decimals);
  }

  @Emit()
  cancel() {}
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';

.token-network-overlay {
  ::v-deep .v-overlay__scrim {
    background: linear-gradient(0deg, #050505 0%, #0a1923 100%) !important;
  }

  ::v-deep .v-overlay__content {
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
  }

  ::v-deep .v-list-item {
    padding: 0;
  }

  .container {
    padding: 0 !important;
  }

  .close-button {
    margin: 15px;
  }

  .token-list {
    height: 100%;
    background-color: transparent !important;
    padding-bottom: 0;
    padding-top: 0;

    & ::v-deep .col-10 {
      padding-left: 5px;
    }
  }

  .connect-new-token,
  .header,
  .token-title {
    font-weight: bold;
    line-height: 20px;
    font-size: 16px;
  }

  .header {
    color: $primary-color;
    text-transform: uppercase;
  }

  .token-balance {
    color: $color-white;
    font-family: Roboto, sans-serif;
    font-size: 16px;
    font-weight: bold;
    line-height: 20px;
    height: 100%;
    padding-right: 20px;
  }

  .token-address {
    color: #696969 !important;
    line-height: 20px;
    font-size: 16px;
  }
}
</style>
