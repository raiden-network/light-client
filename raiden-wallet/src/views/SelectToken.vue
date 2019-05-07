<template>
  <div class="content-host">
    <v-layout align-center justify-center row>
      <v-flex xs10 md10 lg10>
        <div class="screen-title">Select Token</div>
      </v-flex>
    </v-layout>

    <v-layout justify-center row class="list-container">
      <v-flex xs12 md12 lg12>
        <v-list two-line>
          <template v-for="token in allTokens">
            <v-list-tile
              :key="token.address"
              @click="navigateToSelectHub(token.address)"
              class="connection"
            >
              <v-list-tile-avatar>
                <img
                  :src="$blockie(token.address)"
                  alt="Partner address blockie"
                />
              </v-list-tile-avatar>
              <v-list-tile-content>
                <v-list-tile-title>
                  <span class="font-weight-medium">
                    {{ token.symbol }}
                  </span>
                  | {{ token.name }}
                </v-list-tile-title>
                <v-list-tile-sub-title>
                  {{ token.address }}
                </v-list-tile-sub-title>
              </v-list-tile-content>
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

@Component({
  components: { AddressInput },
  computed: mapGetters(['allTokens'])
})
export default class SelectToken extends Mixins(BlockieMixin, NavigationMixin) {
  allTokens!: Token[];
}
</script>

<style lang="scss" scoped>
@import '../scss/input-screen';

.theme--dark.v-list {
  background-color: transparent !important;
}

.connection {
  background-color: rgba(0, 0, 0, 0.25);
  box-shadow: inset 0 -2px 0 0 rgba(0, 0, 0, 0.5);
}
</style>
