<template>
  <v-form v-model="valid" fill-height>
    <v-layout align-center justify-center class="section">
      <v-flex xs10 md6 lg4 class="text-xs-center">
        <h1 class="font-weight-light">Open Channel</h1>
      </v-flex>
    </v-layout>
    <v-layout align-center justify-center row>
      <v-flex xs10 md6 lg4>
        <address-input
          :disabled="true"
          label="Token"
          v-model="tokenAddress"
        ></address-input>
        <address-input
          :disabled="true"
          label="Hub"
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
    <v-layout align-center justify-center class="section">
      <v-flex xs10 md6 lg4 class="text-xs-center">
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
      </v-flex>
    </v-layout>
  </v-form>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import AddressInput from '@/components/AddressInput.vue';

@Component({
  components: { AddressInput }
})
export default class OpenChannel extends Vue {
  private _depositAmount: number = 0;

  tokenAddress: string = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  hubAddress: string = '0x82641569b2062B545431cF6D7F0A418582865ba7';

  get depositAmount(): string {
    if (!this._depositAmount) {
      return '0.0';
    }
    return this._depositAmount.toString();
  }
  set depositAmount(value: string) {
    this._depositAmount = parseFloat(value) || 0;
  }

  valid: boolean = true;
  loading: boolean = false;

  async openChannel() {
    this.loading = true;
    await this.$raiden.openChannel(
      this.tokenAddress,
      this.hubAddress,
      this._depositAmount
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

$header-vertical-margin: 5rem;

.section {
  margin-top: $header-vertical-margin;
  margin-bottom: $header-vertical-margin;
}
</style>
