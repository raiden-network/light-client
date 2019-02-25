<template>
  <v-container>
    <v-layout align-center justify-center row fill-height class="no-wallet">
      <v-flex xs4 md2>
        <v-icon size="80px">warning</v-icon>
      </v-flex>
      <v-flex xs8 md8>
        <h1 class="font-weight-light">
          No valid ethereum wallet was detected! <br />
          You can start using Raiden Wallet <br />
          by downloading Metamask or any other compatible wallet.
        </h1>
      </v-flex>
    </v-layout>
    <v-layout align-center justify-center row fill-height>
      <v-flex xs6 md3 class="text-xs-center">
        <v-img aspect-ratio="1" :src="require('../assets/metamask.svg')" />
        <v-btn target="_blank" href="https://metamask.io/" color="primary">
          Download Metamask
        </v-btn>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class NoValidProvider extends Vue {}
</script>

<style lang="scss" scoped>
$vertical-padding: 60px;
.no-wallet {
  padding-top: $vertical-padding;
  padding-bottom: $vertical-padding;
}
</style>
