<template>
  <div id="container">
    <v-form v-model="valid">
      <v-layout align-center justify-center row>
        <v-flex xs10 md6 lg4>
          <h1 class="display-3 text-capitalize">Deposit</h1>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md6 lg4>
          <h3>Token</h3>
          <p>{{ token }}</p>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md6 lg4>
          <h3>Hub</h3>
          <p>{{ partner }}</p>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row fill-height>
        <v-flex xs10 md6 lg4>
          <amount-input
            :token="tokenInfo"
            v-model="deposit"
            limit
            label="Amount"
          ></amount-input>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center class="section">
        <v-flex xs8 md5 lg3 class="text-xs-center">
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
    <div id="overlay" v-if="loading">
      <v-progress-circular
        :size="70"
        :width="7"
        color="blue"
        indeterminate
      ></v-progress-circular>
      <p id="message">Channel is opening...</p>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import AmountInput from './AmountInput.vue';
import { DepositFailed, OpenChannelFailed } from '@/services/raiden-service';
import { Token } from '@/model/token';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({
  components: { AmountInput }
})
export default class Deposit extends Vue {
  @Prop({ required: true })
  token!: string;
  @Prop({ required: true })
  partner!: string;
  @Prop()
  tokenInfo?: Token;

  deposit: string = '0.0';

  valid: boolean = false;
  loading: boolean = false;
  snackbar: boolean = false;
  error?: string;

  async openChannel() {
    this.loading = true;
    const tokenInfo = this.tokenInfo;
    if (!tokenInfo) {
      throw new Error('no token info');
    }
    try {
      const success = await this.$raiden.openChannel(
        this.token,
        this.partner,
        BalanceUtils.parse(this.deposit, tokenInfo.decimals)
      );

      if (success) {
        this.$router.push({
          name: 'send',
          params: { token: this.token, partner: this.partner }
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

<style scoped lang="scss">
form {
  height: 50vh;
  min-height: 500px;
}

form:first-child {
  margin-top: 20px;
}

#container {
  height: 100%;
}

#overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: fixed;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 9000;
}

#message {
  color: white;
  font-size: 2rem;
  margin-top: 2rem;
}
</style>
