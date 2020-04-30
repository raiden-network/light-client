<template>
  <div class="select-token">
    <list-header
      :header="$t('select-token.header')"
      class="select-token__header"
    ></list-header>

    <v-row no-gutters justify="center" class="select-token__tokens__wrapper">
      <v-col cols="12">
        <recycle-scroller
          #default="{ item }"
          :items="allTokens"
          :buffer="400"
          :item-size="105"
          key-field="address"
          class="select-token__tokens"
        >
          <v-list-item
            :key="item.address"
            class="select-token__tokens__token"
            @click="navigateToSelectHub(item.address)"
          >
            <v-list-item-avatar class="select-token__tokens__token__blockie">
              <img
                :src="$blockie(item.address)"
                :src-lazy="require('../../assets/generic.svg')"
                :alt="$t('select-token.tokens.token.blockie-alt')"
              />
            </v-list-item-avatar>
            <v-list-item-content>
              <v-list-item-title class="select-token__tokens__token__info">
                {{
                  $t('select-token.tokens.token.token-information', {
                    symbol: item.symbol,
                    name: item.name
                  })
                }}
              </v-list-item-title>
              <v-list-item-subtitle
                class="select-token__tokens__token__address"
              >
                <address-display :address="item.address" />
              </v-list-item-subtitle>
            </v-list-item-content>
            <v-list-item-action-text>
              <amount-display
                v-if="typeof item.decimals === 'number'"
                class="select-token__tokens__token__balance"
                exact-amount
                :amount="item.balance"
                :token="item"
              />
            </v-list-item-action-text>
          </v-list-item>
        </recycle-scroller>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import { Token } from '@/model/types';
import NavigationMixin from '@/mixins/navigation-mixin';
import BlockieMixin from '@/mixins/blockie-mixin';
import ListHeader from '@/components/ListHeader.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import Spinner from '@/components/Spinner.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';

@Component({
  components: { Spinner, ListHeader, AddressDisplay, AmountDisplay },
  computed: mapGetters(['allTokens'])
})
export default class SelectToken extends Mixins(BlockieMixin, NavigationMixin) {
  allTokens!: Token[];

  async mounted() {
    await this.$raiden.fetchTokenList();
  }
}
</script>

<style lang="scss" scoped>
@import '../../scss/scroll';
@import '../../scss/colors';
@import '../../scss/fonts';

.select-token {
  height: 100%;
  width: 100%;

  &__header {
    margin-top: 115px;
  }

  &__tokens {
    height: 100%;
    background-color: transparent !important;
    padding-bottom: 0;
    padding-top: 0;
    overflow-y: scroll;

    ::v-deep {
      .v-list-item {
        height: 105px;

        &__action-text {
          height: 44px;
        }
      }
    }

    &__wrapper {
      height: calc(100% - 150px);
      overflow-y: auto;
      @extend .themed-scrollbar;

      .col {
        height: 100%;
        max-height: 1000px;
      }
    }

    &__token {
      background-color: rgba(0, 0, 0, 0.25);
      box-shadow: inset 0 -2px 0 0 rgba(0, 0, 0, 0.5);

      &__balance {
        color: #ffffff;
        font-family: $main-font;
        font-size: 16px;
        font-weight: bold;
        line-height: 20px;
        height: 100%;
        padding-right: 20px;
      }

      &__info {
        font-weight: bold;
        line-height: 20px;
        font-size: 16px;
      }

      &__address {
        color: #696969 !important;
        line-height: 20px;
        font-size: 16px;
      }
    }
  }
}
</style>
