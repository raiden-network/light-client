<template>
  <v-container v-if="!loading && account">
    <v-layout align-center justify-center row>
      <v-flex md6 xs6>
        <div>Raiden Wallet</div>
        <div>{{ account }}</div>
      </v-flex>
      <v-flex md6 xs6>
        <div>Balance</div>
        <div>
          <span>{{ balance }}</span>
          <span>ETHER</span>
        </div>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script lang="ts">
import Vue from 'vue';
import Component from 'vue-class-component';
import OpenChannel from '@/components/OpenChannel.vue';
import { RootState } from '@/types';

@Component({
  components: { OpenChannel }
})
export default class WalletHeader extends Vue {
  get loading(): boolean {
    return this.$store.state.loading;
  }

  get account(): string {
    return this.$store.state.defaultAccount;
  }

  get balance(): string {
    return (this.$store.state as RootState).accountBalance;
  }
}
</script>

<style scoped></style>
