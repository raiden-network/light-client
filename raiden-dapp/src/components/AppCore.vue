<template>
  <no-tokens v-if="!tokens.length" />
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import { TokenModel } from '@/model/types';
import NavigationMixin from '@/mixins/navigation-mixin';
import NoTokens from '@/components/NoTokens.vue';

@Component({
  computed: mapGetters(['tokens']),
  components: { NoTokens }
})
export default class AppCore extends Mixins(NavigationMixin) {
  tokens!: TokenModel[];

  mounted() {
    if (this.tokens.length) {
      this.navigateToSelectTransferTarget(this.tokens[0].address);
    }
  }
}
</script>
