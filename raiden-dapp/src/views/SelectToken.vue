<template>
  <div class="select-token">
    <list-header
      :header="$t('select-token.header')"
      class="select-token__header"
    ></list-header>

    <v-row no-gutters justify="center" class="select-token__tokens__wrapper">
      <v-col cols="12">
        <recycle-scroller
          v-slot="{ item }"
          :items="allTokens"
          :buffer="20"
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
                :src-lazy="require('../assets/generic.svg')"
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
                <v-tooltip bottom>
                  <template #activator="{ on }">
                    <span v-on="on">{{ item.address | truncate }}</span>
                  </template>
                  <span>
                    {{ item.address }}
                  </span>
                </v-tooltip>
              </v-list-item-subtitle>
            </v-list-item-content>
            <v-list-item-action-text>
              <span
                v-if="typeof item.decimals === 'number'"
                class="select-token__tokens__token__balance"
              >
                {{ item.balance | displayFormat(item.decimals) }}
              </span>
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

@Component({
  components: { ListHeader },
  computed: mapGetters(['allTokens'])
})
export default class SelectToken extends Mixins(BlockieMixin, NavigationMixin) {
  allTokens!: Token[];

  mounted() {
    this.$raiden.fetchTokenData(Object.keys(this.$store.state.tokens));
  }
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

.select-token__tokens__wrapper {
  height: calc(100% - 150px);
  overflow-y: scroll;
}

.select-token__tokens {
  height: 100%;
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
