<template>
  <v-form v-model="valid" autocomplete="off" class="payment">
    <v-layout column justify-space-between fill-height>
      <v-layout align-center justify-center>
        <v-flex xs10>
          <address-input v-model="target" :exclude="[token.address, defaultAccount]"></address-input>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center>
        <v-flex xs10>
          <amount-input v-model="amount" :token="token"></amount-input>
        </v-flex>
      </v-layout>

      <divider></divider>

      <token-information :token="token"></token-information>

      <action-button
        :enabled="valid"
        @click="transfer()"
        :text="$t('payment.pay-button')"
      ></action-button>

      <stepper
        :display="loading"
        :steps="steps"
        :done-step="doneStep"
        :done="done"
      ></stepper>

      <error-screen
        :description="error"
        @dismiss="error = ''"
        :title="$t('payment.error.title')"
        :button-label="$t('payment.error.button')"
      ></error-screen>
    </v-layout>
  </v-form>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import AddressInput from '@/components/AddressInput.vue';
import AmountInput from '@/components/AmountInput.vue';
import {
  emptyDescription,
  StepDescription,
  Token,
  TokenPlaceholder
} from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import Stepper from '@/components/Stepper.vue';
import ErrorScreen from '@/components/ErrorScreen.vue';
import Divider from '@/components/Divider.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import ActionButton from '@/components/ActionButton.vue';
import { mapState } from 'vuex';

@Component({
  components: {
    ActionButton,
    TokenInformation,
    Divider,
    AddressInput,
    AmountInput,
    Stepper,
    ErrorScreen
  },
  computed: {
    ...mapState(['defaultAccount'])
  }
})
export default class Payment extends Vue {
  target: string = '';
  token: Token = TokenPlaceholder;
  defaultAccount!: string;
  amount: string = '0';

  valid: boolean = false;
  loading: boolean = false;
  done: boolean = false;

  error: string = '';

  steps: StepDescription[] = [];
  doneStep: StepDescription = emptyDescription();

  async created() {
    const { token } = this.$route.params;
    this.token = (await this.$raiden.getToken(token)) || TokenPlaceholder;
    this.steps = [
      (this.$t('payment.steps.transfer') as any) as StepDescription
    ];
    this.doneStep = (this.$t('payment.steps.done') as any) as StepDescription;
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
.payment {
  width: 100%;
  height: 100%;
}
</style>
