<template>
  <v-container v-if="!tokens.length" fluid class="new-token fill-height">
    <v-row align="center" justify="center" no-gutters>
      <v-col class="new-token__button" cols="12">
        <v-btn fab color="primary" @click="navigateToTokenSelect()">
          <v-icon large>mdi-plus</v-icon>
        </v-btn>
      </v-col>
      <v-col class="new-token__header" cols="12">
        {{ $t('tokens.connect-new') }}
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts">
import { Component, Watch, Mixins } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import { TokenModel } from '@/model/types';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({
  computed: {
    ...mapGetters(['tokens'])
  }
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

<style lang="scss" scoped>
.new-token {
  &__button,
  &__header {
    text-align: center;
  }

  &__header {
    padding: 15px 0 35px 0;
  }
}
</style>
