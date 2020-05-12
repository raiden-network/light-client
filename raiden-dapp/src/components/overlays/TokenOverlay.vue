<template>
  <v-overlay :value="show" absolute opacity="1.0" class="token-network-overlay">
    <v-container v-if="show" class="token-network__container">
      <v-row no-gutters justify="end">
        <v-btn icon class="token-network-overlay__close-button" @click="cancel">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-row>

      <v-row id="connect-new">
        <v-col cols="12">
          <v-list class="connect-new__item-list">
            <v-list-item @click="navigateToTokenSelect()">
              <v-col cols="2">
                <v-list-item-avatar>
                  <v-btn class="mx-2" fab dark small color="primary">
                    <v-icon dark large>mdi-plus</v-icon>
                  </v-btn>
                </v-list-item-avatar>
              </v-col>
              <v-col
                cols="10"
                align-self="center"
                class="connect-new__connect-new-token"
              >
                {{ $t('tokens.connect-new') }}
              </v-col>
            </v-list-item>
          </v-list>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="2" class="hidden-sm-and-down" align-self="center"></v-col>
        <v-col
          cols="10"
          align-self="center"
          class="token-network-overlay__header"
        >
          {{ $t('tokens.connected.header') }}
        </v-col>
      </v-row>

      <v-row class="token-list">
        <v-col cols="12">
          <v-list
            v-for="(token, i) in tokens"
            :key="i"
            class="token-list__item-list"
          >
            <v-list-item
              :key="token.address"
              @click="handleTokenClick(token.address)"
            >
              <v-col cols="2">
                <v-list-item-avatar>
                  <img
                    :src="$blockie(token.address)"
                    :src-lazy="require('@/assets/generic.svg')"
                    :alt="$t('select-token.tokens.token.blockie-alt')"
                  />
                </v-list-item-avatar>
              </v-col>
              <v-col cols="7">
                <v-list-item-content>
                  <v-list-item-title class="token-list__token-title">
                    {{
                      $t('select-token.tokens.token.token-information', {
                        symbol: token.symbol,
                        name: token.name
                      })
                    }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="token-list__token-address">
                    <address-display :address="token.address" />
                  </v-list-item-subtitle>
                </v-list-item-content>
              </v-col>
              <v-col cols="3">
                <v-row justify="end">
                  <v-list-item-action-text>
                    <amount-display
                      class="token-list__token-balance"
                      exact-amount
                      :amount="getTokenDetails(token).balance"
                      :token="getTokenDetails(token)"
                    />
                  </v-list-item-action-text>
                </v-row>
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
import NavigationMixin from '@/mixins/navigation-mixin';
import { TokenModel, Token } from '@/model/types';
import AddressDisplay from '@/components/AddressDisplay.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';

@Component({
  components: { AddressDisplay, AmountDisplay },
  computed: {
    ...mapGetters(['tokens', 'allTokens'])
  }
})
export default class TokenOverlay extends Mixins(
  BlockieMixin,
  NavigationMixin
) {
  @Prop({ required: true, type: Boolean })
  show!: boolean;

  allTokens!: Token[];
  tokens!: TokenModel[];

  handleTokenClick(tokenAddress: string) {
    const { token } = this.$route.params;

    if (token !== tokenAddress) {
      this.navigateToSelectTransferTarget(tokenAddress);
    }

    this.cancel();
  }

  getTokenDetails(token: TokenModel) {
    return this.$store.getters.token(token.address);
  }

  @Emit()
  cancel() {}
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';
@import '@/scss/scroll';
@import '@/scss/fonts';
@import '@/scss/mixins';

.token-network-overlay {
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;

  ::v-deep {
    .v-overlay {
      &__scrim {
        background: linear-gradient(
          180deg,
          #050505 0%,
          #0a1923 100%
        ) !important;
      }

      &__content {
        position: absolute;
        top: 0;
        right: 0;
        width: 100%;
        height: 100%;
      }
    }

    .v-list-item {
      padding: 0 0 0 48px;

      @include respond-to(handhelds) {
        padding: 0;
      }
    }
  }

  .token-network {
    &__container {
      padding: 0 !important;
      height: 100%;
    }
  }

  &__close-button {
    margin: 15px;
  }

  .token-list {
    height: calc(100% - 230px);

    &__item-list {
      overflow-y: auto;
      @extend .themed-scrollbar;

      background-color: transparent !important;
      padding-bottom: 0;
      padding-top: 0;

      ::v-deep {
        .col-10 {
          padding-left: 11px;
        }
      }
    }

    &__token-title {
      font-weight: bold;
      line-height: 20px;
      font-size: 16px;
    }

    &__token-balance {
      color: $color-white;
      font-family: $main-font;
      font-size: 16px;
      font-weight: bold;
      line-height: 20px;
      height: 100%;
      padding-right: 20px;
    }

    &__token-address {
      color: #696969 !important;
      line-height: 20px;
      font-size: 16px;
    }
  }

  .connect-new {
    &__item-list {
      height: 100%;
      background-color: transparent !important;
      padding-bottom: 0;
      padding-top: 0;

      ::v-deep {
        .col-10 {
          padding-left: 11px;
        }
      }
    }

    &__connect-new-token {
      font-weight: bold;
      line-height: 20px;
      font-size: 16px;
    }
  }

  &__header {
    font-weight: bold;
    line-height: 20px;
    font-size: 16px;

    color: $primary-color;
    text-transform: uppercase;
    padding-left: 58px;
  }
}
</style>
