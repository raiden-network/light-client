<template>
  <div class="content-host">
    <list-header class="header" header="Available"></list-header>

    <v-layout justify-center row class="list-container">
      <v-flex xs12>
        <v-list class="token-list">
          <template v-for="token in allTokens">
            <v-list-tile
              :key="token.address"
              class="token"
              @click="navigateToSelectHub(token.address)"
            >
              <v-list-tile-avatar class="list-blockie">
                <img
                  :src="$blockie(token.address)"
                  alt="Partner address blockie"
                />
              </v-list-tile-avatar>
              <v-list-tile-content>
                <v-list-tile-title class="token-info">
                  {{ token.symbol }} | {{ token.name }}
                </v-list-tile-title>
                <v-list-tile-sub-title class="token-address">
                  <v-tooltip bottom>
                    <template #activator="{ on }">
                      <span v-on="on">{{ token.address | truncate }}</span>
                    </template>
                    <span> {{ token.address }} </span>
                  </v-tooltip>
                </v-list-tile-sub-title>
              </v-list-tile-content>
              <v-list-tile-action-text>
                <span class="balance">
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
@import '../scss/input-screen';

.header {
  margin-top: 115px;
}

.token-list {
  background-color: transparent !important;
}

.balance {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  font-weight: bold;
  line-height: 20px;
  height: 100%;
  padding-right: 20px;
}

.token-list /deep/ .v-list__tile {
  height: 105px;
}

.token-list /deep/ .v-list__tile__action-text {
  height: 44px;
}

.token-list {
  padding-bottom: 0;
  padding-top: 0;
}

.token {
  background-color: rgba(0, 0, 0, 0.25);
  box-shadow: inset 0 -2px 0 0 rgba(0, 0, 0, 0.5);
}

.token-info {
  font-weight: bold;
  line-height: 20px;
  font-size: 16px;
}

.token-address {
  color: #696969 !important;
  line-height: 20px;
  font-size: 16px;
}
</style>
