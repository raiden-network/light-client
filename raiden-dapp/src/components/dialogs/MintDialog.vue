<template>
  <raiden-dialog :visible="visible" @close="cancel">
    <v-card-title v-if="!error">
      {{ $t('mint-dialog.title', { symbol: token.symbol }) }}
    </v-card-title>
    <v-card-text>
      <v-row v-if="loading" class="mint-dialog--progress">
        <v-col cols="12">
          <v-row no-gutters align="center" justify="center">
            <v-progress-circular
              :size="125"
              :width="4"
              color="primary"
              indeterminate
            ></v-progress-circular>
          </v-row>
        </v-col>
      </v-row>
      <v-row v-if="error">
        <error-message :error="error" />
      </v-row>
      <v-row v-if="!loading && !error" class="mint-dialog__available">
        {{ $t('mint-dialog.description') }}
      </v-row>
    </v-card-text>
    <v-card-actions v-if="!error">
      <action-button
        arrow
        :enabled="!loading"
        :text="$t('general.buttons.continue')"
        class="mint-dialog__action"
        @click="mint()"
      ></action-button>
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Vue, Emit, Prop } from 'vue-property-decorator';
import { RaidenError } from 'raiden-ts';

import ActionButton from '@/components/ActionButton.vue';
import { Token } from '@/model/types';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({
  components: { ActionButton, RaidenDialog, ErrorMessage }
})
export default class MintDepositDialog extends Vue {
  @Prop({ required: true })
  token!: Token;

  @Prop({ required: true, type: Boolean })
  visible!: boolean;

  loading: boolean = false;
  error: Error | RaidenError | null = null;
  amount: string = '1';

  @Emit()
  cancel() {
    this.error = null;
  }

  async mint() {
    this.error = null;
    this.loading = true;

    try {
      await this.$raiden.mint(
        this.token.address,
        BalanceUtils.parse(this.amount, this.token.decimals!)
      );
      this.$emit('done');
    } catch (e) {
      this.error = e;
    }

    this.loading = false;
  }
}
</script>
