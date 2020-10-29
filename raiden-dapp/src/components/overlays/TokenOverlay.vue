<template>
  <v-overlay absolute opacity="1.0" class="token-overlay">
    <div class="d-flex justify-end">
      <v-btn class="ma-4 token-overlay__close-button" icon @click="cancel">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </div>

    <v-list class="transparent">
      <v-list-item
        data-cy="token_overlay_connect_new"
        class="token-overlay__connect-new"
        @click="navigateToTokenSelect()"
      >
        <v-col cols="2">
          <v-list-item-avatar>
            <v-btn class="mx-2" fab dark small color="primary">
              <v-icon dark large>mdi-plus</v-icon>
            </v-btn>
          </v-list-item-avatar>
        </v-col>
        <v-col cols="10" align-self="center" class="font-weight-bold">
          {{ $t('tokens.connect-new') }}
        </v-col>
      </v-list-item>
    </v-list>

    <div class="token-overlay__connected-tokens mt-8">
      <token-list
        :header="$t('tokens.connected.header')"
        :tokens="tokens"
        @select="handleTokenClick"
      />
    </div>
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
.token-overlay {
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
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }
    }
  }

  &__connected-tokens {
    overflow-y: hidden;
  }
}
</style>
