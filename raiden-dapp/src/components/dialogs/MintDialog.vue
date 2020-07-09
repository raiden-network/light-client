<template>
  <raiden-dialog :visible="visible" @close="cancel">
    <v-card-title v-if="!error">
      {{ $t('mint-dialog.title', { symbol: token.symbol }) }}
    </v-card-title>
    <v-card-text>
      <v-row v-if="loading">
        <spinner />
      </v-row>
      <v-row v-if="error">
        <error-message :error="error" />
      </v-row>
      <v-row v-if="!loading && !error">
        {{ $t('mint-dialog.description') }}
      </v-row>
    </v-card-text>
    <v-card-actions v-if="!error">
      <action-button
        arrow
        :enabled="!loading"
        :text="$t('general.buttons.continue')"
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
import Spinner from '@/components/icons/Spinner.vue';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({
  components: { ActionButton, RaidenDialog, ErrorMessage, Spinner },
})
export default class MintDialog extends Vue {
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
