<template>
  <v-container class="no-connected-token fill-height flex-column justify-center" fluid>
    <v-btn
      data-cy="no-connected-token__connect-button"
      class="no-connected-token__connect-button"
      color="primary"
      fab
      @click="navigateToTokenSelect()"
    >
      <v-icon large>mdi-plus</v-icon>
    </v-btn>
    <span class="no-connected-token__connect-label pt-4">{{ $t('tokens.connect-new') }}</span>
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';

import NavigationMixin from '@/mixins/navigation-mixin';

@Component
export default class NoConnectedTokenRoute extends Mixins(NavigationMixin) {}
</script>
