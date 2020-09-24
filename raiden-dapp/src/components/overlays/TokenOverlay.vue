<template>
  <v-overlay absolute opacity="1.0" class="token-network-overlay">
    <v-container class="token-network__container">
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

      <token-list
        :header="$t('tokens.connected.header')"
        :tokens="tokens"
        @select="handleTokenClick"
        class="mt-8"
      />
    </v-container>
  </v-overlay>
</template>

<script lang="ts">
import { Component, Mixins, Emit } from 'vue-property-decorator';
import { mapGetters } from 'vuex';

import BlockieMixin from '@/mixins/blockie-mixin';
import NavigationMixin from '@/mixins/navigation-mixin';
import { TokenModel, Token } from '@/model/types';
import TokenList from '@/components/tokens/TokenList.vue';

@Component({
  components: { TokenList },
  computed: { ...mapGetters(['tokens']) },
})
export default class TokenOverlay extends Mixins(
  BlockieMixin,
  NavigationMixin
) {
  tokens!: TokenModel[];

  handleTokenClick(selectToken: Token): void {
    const { token } = this.$route.params;

    if (token !== selectToken.address) {
      this.navigateToSelectTransferTarget(selectToken.address);
    }

    this.cancel();
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
