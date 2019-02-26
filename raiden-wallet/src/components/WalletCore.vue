<template>
  <OpenChannel></OpenChannel>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import OpenChannel from '@/components/OpenChannel.vue';

@Component({
  components: { OpenChannel }
})
export default class WalletCore extends Vue {}
</script>

<style></style>
