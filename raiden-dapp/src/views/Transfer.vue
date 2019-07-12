<template>
  <div class="content-host">
    <v-form v-model="valid" autocomplete="off">
      <v-layout align-center justify-center row>
        <v-flex xs10>
          <address-input v-model="target" class="address-input"></address-input>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10>
          <amount-input v-model="amount" :token="token"></amount-input>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <div class="divider"></div>
      </v-layout>

      <v-layout align-center justify-center row class="information__wrapper">
        <v-flex xs2 class="information">
          <div class="information-label text-xs-left">Token</div>
        </v-flex>
        <v-flex xs8>
          <div class="information-description text-xs-left">
            <div>{{ token.symbol }} | {{ token.name }}</div>
            {{ token.address }}
          </div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center class="section">
        <v-flex xs10 class="text-xs-center">
          <v-btn
            id="transfer"
            class="text-capitalize confirm-button"
            depressed
            :disabled="!valid"
            large
            @click="transfer()"
          >
            Pay
          </v-btn>
        </v-flex>
      </v-layout>
    </v-form>
    <progress-overlay
      :display="loading"
      :steps="steps"
      :done-step="doneStep"
      :done="done"
    ></progress-overlay>
    <error-screen
      title="Something went wrong"
      :description="error"
      button-label="Dismiss"
      @dismiss="error = ''"
    ></error-screen>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import AddressInput from '@/components/AddressInput.vue';
import AmountInput from '@/components/AmountInput.vue';
import { StepDescription, Token, TokenPlaceholder } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import ProgressOverlay from '@/components/ProgressOverlay.vue';
import ErrorScreen from '@/components/ErrorScreen.vue';

@Component({
  components: {
    AddressInput,
    AmountInput,
    ProgressOverlay,
    ErrorScreen
  }
})
export default class Transfer extends Vue {
  target: string = '';
  token: Token = TokenPlaceholder;
  amount: string = '0';

  valid: boolean = false;
  loading: boolean = false;
  done: boolean = false;

  error: string = '';

  protected readonly steps: StepDescription[] = [
    {
      label: 'Transfer',
      title: 'Sending Tokens',
      description:
        'Please do not close the browser and confirm the transactions with MetaMask.'
    }
  ];

  protected readonly doneStep: StepDescription = {
    label: 'Done',
    title: 'Send Successful',
    description: 'Your transfer was successful'
  };

  async created() {
    const { token } = this.$route.params;
    this.token = (await this.$raiden.getToken(token)) || TokenPlaceholder;
  }

  async transfer() {
    const { address, decimals } = this.token;
    try {
      this.loading = true;
      await this.$raiden.transfer(
        address,
        this.target,
        BalanceUtils.parse(this.amount, decimals)
      );
      this.done = true;
      setTimeout(() => {
        this.loading = false;
        this.done = false;
      }, 2000);
    } catch (e) {
      this.loading = false;
      this.done = false;
      this.error = e.message;
    }
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/input-screen';

.divider {
  margin-top: 60px;
  margin-bottom: 20px;
}
</style>
