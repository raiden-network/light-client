<template>
  <v-container>
    <v-layout text-xs-center wrap>
      <v-flex xs12>
        <OpenChannel></OpenChannel>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script lang="ts">
import Vue from 'vue';
import Component from 'vue-class-component';
import OpenChannel from '@/components/OpenChannel.vue';

@Component({
  components: { OpenChannel }
})
export default class WalletCore extends Vue {}
</script>

<style></style>
