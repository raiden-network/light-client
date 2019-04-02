<template>
  <TokenNetworks></TokenNetworks>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import TokenNetworks from '@/components/TokenNetworks.vue';

@Component({
  components: { TokenNetworks }
})
export default class WalletCore extends Vue {}
</script>

<style></style>
