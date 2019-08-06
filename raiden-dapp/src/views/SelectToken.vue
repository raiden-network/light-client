<template>
  <div class="select-token">
    <list-header
      :header="$t('select-token.header')"
      class="select-token__header"
    ></list-header>

    <v-layout justify-center>
      <v-flex xs12>
        <v-list class="select-token__tokens">
          <template v-for="token in allTokens">
            <v-list-item
              :key="token.address"
              @click="navigateToSelectHub(token.address)"
              class="select-token__tokens__token"
            >
              <v-list-item-avatar class="select-token__tokens__token__blockie">
                <img
                  :src="$blockie(token.address)"
                  :alt="$t('select-token.tokens.token.blockie-alt')"
                />
              </v-list-item-avatar>
              <v-list-item-content>
                <v-list-item-title class="select-token__tokens__token__info">
                  {{
                    $t('select-token.tokens.token.token-information', {
                      symbol: token.symbol,
                      name: token.name
                    })
                  }}
                </v-list-item-title>
                <v-list-item-subtitle
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
                </v-list-item-subtitle>
              </v-list-item-content>
              <v-list-item-action-text>
                <span class="select-token__tokens__token__balance">
                  {{ token.balance | displayFormat(token.decimals) }}
                </span>
              </v-list-item-action-text>
            </v-list-item>
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

.select-token__tokens ::v-deep .v-list-item {
  height: 105px;
}

.select-token__tokens ::v-deep .v-list-item__action-text {
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
