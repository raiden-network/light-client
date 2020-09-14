<template>
  <v-container class="fill-height flex-column justify-center">
    <v-btn fab color="primary" @click="navigateToTokenSelect()">
      <v-icon large>mdi-plus</v-icon>
    </v-btn>
    <span class="pt-4">{{ $t('tokens.connect-new') }}</span>
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component
export default class NoTokens extends Mixins(NavigationMixin) {}
</script>
