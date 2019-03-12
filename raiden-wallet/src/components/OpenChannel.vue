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
    <v-snackbar v-model="snackbar" bottom multi-line>
      {{ error }}
      <v-btn color="pink" flat @click="snackbar = false">
        Close
      </v-btn>
    </v-snackbar>
  </v-form>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import AddressInput from '@/components/AddressInput.vue';
import { DepositFailed, OpenChannelFailed } from '@/services/raiden-service';

@Component({
  components: { AddressInput }
})
export default class OpenChannel extends Vue {
  private _depositAmount: number = 0;

  tokenAddress: string = '0xd0A1E359811322d97991E03f863a0C30C2cF029C';
  hubAddress: string = '0x1D36124C90f53d491b6832F1c073F43E2550E35b';

  snackbar: boolean = false;
  error: string = '';

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
    try {
      const success = await this.$raiden.openChannel(
        this.tokenAddress,
        this.hubAddress,
        this._depositAmount
      );

      if (success) {
        this.$router.push({
          name: 'send',
          params: { token: this.tokenAddress }
        });
      }
    } catch (e) {
      this.error = '';
      if (e instanceof OpenChannelFailed) {
        this.error = 'Channel open failed.';
      } else if (e instanceof DepositFailed) {
        this.error = 'Could not deposit to the channel.';
      }

      if (this.error) {
        this.snackbar = true;
      }
    }
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
