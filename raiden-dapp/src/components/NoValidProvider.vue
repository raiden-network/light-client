<template>
  <div class="text-xs-center wrapper">
    <v-layout align-center justify-center class="no-wallet">
      <v-flex xs10 md10 lg8 class="mid-section">
        <div class="font-weight-light display-1">
          No valid ethereum wallet was detected!
        </div>
        <div class="subheading font-weight-medium">
          You can start using Raiden Wallet by downloading Metamask or any other
          compatible wallet.
        </div>
      </v-flex>
    </v-layout>
    <v-layout align-center justify-center>
      <v-flex xs6 md3 class="mid-section">
        <div>
          <v-img
            height="160"
            aspect-ratio="1"
            contain
            :src="require('../assets/metamask.svg')"
          />
        </div>
        <v-btn target="_blank" href="https://metamask.io/" color="primary">
          Download Metamask
        </v-btn>
      </v-flex>
    </v-layout>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class NoValidProvider extends Vue {}
</script>

<style lang="scss" scoped>
$section-vertical-padding: 60px;
.wrapper > * {
  margin-top: $section-vertical-padding;
  margin-bottom: $section-vertical-padding;
}

$item-vertical-padding: 20px;
.mid-section > * {
  margin-top: $item-vertical-padding;
  margin-bottom: $item-vertical-padding;
}

.no-wallet /deep/ div {
  text-align: left;
}
v-img {
  margin-left: auto;
  margin-right: auto;
}
</style>
