<template>
  <v-container class="new-token">
    <v-col class="new-token__button">
      <v-btn fab color="primary" @click="navigateToTokenSelect()">
        <v-icon large>mdi-plus</v-icon>
      </v-btn>
    </v-col>
    <v-col class="new-token__header">
      {{ $t('tokens.connect-new') }}
    </v-col>
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({})
export default class NoTokens extends Mixins(NavigationMixin) {}
</script>

<style lang="scss" scoped>
.new-token {
  text-align: center;

  &__button {
    padding: 0;
  }

  &__header {
    padding: 15px 0px 35px 0px;
  }
}
</style>
