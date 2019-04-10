<template>
  <div id="container">
    <v-form v-model="valid">
      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10>
          <div class="screen-title">Open Channel</div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10>
          <amount-input
            :token="tokenInfo"
            v-model="deposit"
            limit
          ></amount-input>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <div class="divider"></div>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10 class="information">
          <div class="information-label text-xs-left">Token</div>
          <div class="information-description text-xs-left">{{ token }}</div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10 class="information">
          <div class="information-label text-xs-left">Hub</div>
          <div class="information-description text-xs-left">{{ partner }}</div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center class="section">
        <v-flex xs10 md10 lg10 class="text-xs-center">
          <v-btn
            class="text-capitalize"
            depressed
            id="open-channel"
            :disabled="!valid"
            :loading="loading"
            large
            @click="openChannel()"
          >
            Make Deposit
          </v-btn>
        </v-flex>
      </v-layout>
    </v-form>
    <progress-overlay
      :display="loading"
      message="Channel is opening..."
    ></progress-overlay>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import AmountInput from './AmountInput.vue';
import { DepositFailed, OpenChannelFailed } from '@/services/raiden-service';
import { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import ProgressOverlay from '@/components/ProgressOverlay.vue';

@Component({
  components: { ProgressOverlay, AmountInput }
})
export default class Deposit extends Vue {
  @Prop({ required: true })
  token!: string;
  @Prop({ required: true })
  partner!: string;
  @Prop({ required: true })
  tokenInfo!: Token;

  deposit: string = '0.00';

  valid: boolean = false;
  loading: boolean = false;
  snackbar: boolean = false;
  error: string = '';

  async openChannel() {
    this.loading = true;
    const tokenInfo = this.tokenInfo;
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

.screen-title {
  margin-top: 30px;
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 24px;
  line-height: 28px;
  text-align: center;
}

.divider {
  box-sizing: border-box;
  height: 1px;
  width: 500px;
  border: 1px solid #696969;
}

.information {
  padding-bottom: 34px;
  padding-top: 34px;
  .information-label {
    color: #ffffff;
    font-family: Roboto, sans-serif;
    font-size: 24px;
    line-height: 28px;
    text-align: center;
  }
  .information-description {
    margin-top: 12px;
    color: #ffffff;
    font-family: Roboto, sans-serif;
    font-size: 16px;
    line-height: 19px;
  }
}

#open-channel {
  margin-top: 130px;
  height: 40px;
  width: 250px;
  border-radius: 29px;
  background-color: #000000 !important;
}

#open-channel:hover {
  background-color: #0e0e0e !important;
}
</style>
