<template>
  <TokenNetworks></TokenNetworks>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Tokens from '@/components/Tokens.vue';

@Component({
  components: { TokenNetworks: Tokens }
})
export default class WalletCore extends Vue {}
</script>

<style></style>
