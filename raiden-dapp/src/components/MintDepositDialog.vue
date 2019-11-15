<template>
  <v-card class="mint-deposit-dialog">
    <v-btn icon class="mint-deposit-dialog__close" @click="cancel">
      <v-icon>mdi-close</v-icon>
    </v-btn>
    <v-card-text>
      <v-row justify="center" no-gutters>
        <v-col cols="4">
          <!-- TODO: Tried to use AmountInput but seems to have a different purpose, design is still off -->
          <!-- TODO: pass correct token symbol instead of hardcoded SVT suffix -->
          <v-text-field
            v-model="amount"
            autofocus
            type="number"
            suffix="SVT"
            class="mint-deposit-dialog__amount"
          />
        </v-col>
      </v-row>
      <v-row class="mint-deposit-dialog__available">
        {{
          $t('mint-deposit-dialog.available', {
            balance: accountBalance,
            currency: $t('app-header.currency')
          })
        }}
      </v-row>
    </v-card-text>
    <v-card-actions>
      <action-button
        sticky
        arrow
        :loading="loading"
        :enabled="amount.length && !loading"
        :text="$t('mint-deposit-dialog.button')"
        class="mint-deposit-dialog__action"
        @click="mintDeposit()"
      >
      </action-button>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue, Emit } from 'vue-property-decorator';
import { mapState } from 'vuex';

import ActionButton from '@/components/ActionButton.vue';

@Component({
  components: { ActionButton },
  computed: {
    ...mapState(['accountBalance'])
  }
})
export default class MintDepositDialog extends Vue {
  amount: string = '10';
  loading: boolean = false;

  @Emit()
  cancel() {}

  async mintDeposit() {
    this.loading = true;

    // TODO: mint via
    //await this.$raiden.mint(token, amount)
    await new Promise(resolve => setTimeout(resolve, 5000));
    // TODO: deposit

    this.loading = false;
    this.$emit('done');
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';

.mint-deposit-dialog {
  background-color: #141414;
  border-radius: 10px !important;
  padding: 20px 20px 55px 20px;

  &__amount {
    font-size: 24px;
    font-weight: bold;
    color: $color-white;

    & ::v-deep input {
      text-align: center;
    }

    & ::v-deep .v-input__slot::before {
      border: none !important;
    }

    & ::v-deep .v-text-field__details {
      display: none;
    }
  }

  &__available {
    text-align: center;
  }

  &__close {
    position: absolute;
    right: 15px;
    top: 15px;
  }
}
</style>
