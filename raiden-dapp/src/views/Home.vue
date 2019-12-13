<template>
  <no-tokens v-if="!tokens.length" />
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import { TokenModel } from '@/model/types';
import NavigationMixin from '@/mixins/navigation-mixin';
import NoTokens from '@/components/NoTokens.vue';

@Component({
  computed: mapGetters(['tokens']),
  components: { NoTokens }
})
export default class Home extends Mixins(NavigationMixin) {
  tokens!: TokenModel[];

  @Watch('tokens')
  onChange(tokens: TokenModel[]) {
    if (tokens.length) {
      this.navigateToSelectTransferTarget(tokens[0].address);
    }
  }
}
</script>
