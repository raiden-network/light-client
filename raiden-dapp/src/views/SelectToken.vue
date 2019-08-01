<template>
  <div class="select-token">
    <list-header
      :header="$t('select-token.header')"
      class="select-token__header"
    ></list-header>

    <v-layout justify-center row>
      <v-flex xs12>
        <v-list class="select-token__tokens">
          <template v-for="token in allTokens">
            <v-list-tile
              :key="token.address"
              @click="navigateToSelectHub(token.address)"
              class="select-token__tokens__token"
            >
              <v-list-tile-avatar class="select-token__tokens__token__blockie">
                <img
                  :src="$blockie(token.address)"
                  :alt="$t('select-token.tokens.token.blockie-alt')"
                />
              </v-list-tile-avatar>
              <v-list-tile-content>
                <v-list-tile-title class="select-token__tokens__token__info">
                  {{
                    $t('select-token.tokens.token.token-information', {
                      symbol: token.symbol,
                      name: token.name
                    })
                  }}
                </v-list-tile-title>
                <v-list-tile-sub-title
                  class="select-token__tokens__token__address"
                >
                  <v-tooltip bottom>
                    <template #activator="{ on }">
                      <span v-on="on">{{ token.address | truncate }}</span>
                    </template>
                    <span>
                      {{ token.address }}
                    </span>
                  </v-tooltip>
                </v-list-tile-sub-title>
              </v-list-tile-content>
              <v-list-tile-action-text>
                <span class="select-token__tokens__token__balance">
                  {{ token.balance | displayFormat(token.decimals) }}
                </span>
              </v-list-tile-action-text>
            </v-list-tile>
          </template>
        </v-list>
      </v-flex>
    </v-layout>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import AddressInput from '@/components/AddressInput.vue';
import { mapGetters } from 'vuex';
import { Token } from '@/model/types';
import NavigationMixin from '@/mixins/navigation-mixin';
import BlockieMixin from '@/mixins/blockie-mixin';
import ListHeader from '@/components/ListHeader.vue';

@Component({
  components: { ListHeader, AddressInput },
  computed: mapGetters(['allTokens'])
})
export default class SelectToken extends Mixins(BlockieMixin, NavigationMixin) {
  allTokens!: Token[];
}
</script>

<style lang="scss" scoped>
.select-token {
  height: 100%;
  width: 100%;
}

.select-token__header {
  margin-top: 115px;
}

.select-token__tokens {
  background-color: transparent !important;
  padding-bottom: 0;
  padding-top: 0;
}

.select-token__tokens__token__balance {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  font-weight: bold;
  line-height: 20px;
  height: 100%;
  padding-right: 20px;
}

.select-token__tokens /deep/ .v-list__tile {
  height: 105px;
}

.select-token__tokens /deep/ .v-list__tile__action-text {
  height: 44px;
}

.select-token__tokens__token {
  background-color: rgba(0, 0, 0, 0.25);
  box-shadow: inset 0 -2px 0 0 rgba(0, 0, 0, 0.5);
}

.select-token__tokens__token__info {
  font-weight: bold;
  line-height: 20px;
  font-size: 16px;
}

.select-token__tokens__token__address {
  color: #696969 !important;
  line-height: 20px;
  font-size: 16px;
}
</style>
