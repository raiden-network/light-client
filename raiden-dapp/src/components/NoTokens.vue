<template>
  <v-container
    v-if="!tokens.length"
    class="fill-height flex-column justify-center"
  >
    <v-btn fab color="primary" @click="navigateToTokenSelect()">
      <v-icon large>mdi-plus</v-icon>
    </v-btn>
    <span class="pt-4">{{ $t('tokens.connect-new') }}</span>
  </v-container>
</template>

<script lang="ts">
import { Component, Watch, Mixins } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import { TokenModel } from '@/model/types';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({
  computed: {
    ...mapGetters(['tokens']),
  },
})
export default class NoTokens extends Mixins(NavigationMixin) {
  tokens!: TokenModel[];

  @Watch('tokens', { immediate: true })
  onChange(tokens: TokenModel[]) {
    if (tokens.length) {
      this.navigateToSelectTransferTarget(tokens[0].address);
    }
  }
}
</script>
