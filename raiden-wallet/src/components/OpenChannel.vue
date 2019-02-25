<template>
  <v-form v-model="valid">
    <v-container>
      <h1 class="font-weight-light">Open Channel</h1>

      <v-layout align-center justify-center row fill-height>
        <v-flex xs8 md6>
          <address-input
            label="Token"
            disabled
            v-model="tokenAddress"
          ></address-input>
          <address-input
            label="Hub"
            disabled
            v-model="hubAddress"
          ></address-input>
          <label class="subheading">Deposit</label>
          <v-text-field
            id="deposit"
            class="font-weight-thin deposit"
            label=""
            :disabled="loading"
            mask="#.##################"
            v-model="depositAmount"
            placeholder="0.0"
          ></v-text-field>
        </v-flex>
      </v-layout>
      <v-btn
        :disabled="!valid"
        :loading="loading"
        color="green"
        large
        @click="openChannel()"
      >
        <v-icon left dark>check_circle</v-icon>
        Open
      </v-btn>
    </v-container>
  </v-form>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import AddressInput from '@/components/AddressInput.vue';

@Component({
  components: { AddressInput }
})
export default class OpenChannel extends Vue {
  tokenAddress: string = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  hubAddress: string = '0x82641569b2062B545431cF6D7F0A418582865ba7';
  depositAmount: number = 0;

  valid: boolean = true;
  loading: boolean = false;

  async openChannel() {
    this.loading = true;
    await this.$web3.openChannel(
      this.tokenAddress,
      this.hubAddress,
      this.depositAmount
    );
    this.loading = false;
  }
}
</script>

<style lang="scss" scoped>
.deposit {
  font-size: 6em;
}

.deposit /deep/ input {
  max-height: 210px;
}
</style>
