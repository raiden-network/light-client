<template>
  <div class="select-token flex-grow-1 pt-8">
    <token-list :header="$t('select-token.header')" :tokens="allTokens" @select="selectToken" />
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters } from 'vuex';

import TokenList from '@/components/tokens/TokenList.vue';
import BlockieMixin from '@/mixins/blockie-mixin';
import NavigationMixin from '@/mixins/navigation-mixin';
import type { Token } from '@/model/types';

@Component({
  components: { TokenList },
  computed: mapGetters(['allTokens']),
})
export default class SelectTokenRoute extends Mixins(BlockieMixin, NavigationMixin) {
  allTokens!: Token[];

  async mounted() {
    await this.$raiden.fetchTokenList();
  }

  selectToken(token: Token): void {
    this.navigateToSelectHub(token.address);
  }
}
</script>

<style lang="scss" scoped>
.select-token {
  height: 100%;
}
</style>
