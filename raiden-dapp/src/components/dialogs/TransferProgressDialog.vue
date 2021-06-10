<template>
  <raiden-dialog :visible="visible" class="transfer-progress-dialog" @close="dismiss">
    <v-card-title>{{ title }}</v-card-title>

    <v-card-text>
      <ul class="transfer-progress-dialog__progress-steps">
        <li
          v-for="(status, index) in progress"
          :key="index"
          class="transfer-progress-dialog__progress-step"
        >
          {{ $t(`progress-steps.transfer.${status}`) }}
        </li>
      </ul>

      <template v-if="error">
        <v-img class="transfer-progress-dialog__error my-4" :src="require('@/assets/error.png')" />
        <span>{{ error }}</span>
      </template>

      <spinner v-else-if="inProgress" />

      <template v-else>
        <v-img class="transfer-progress-dialog__done my-4" :src="require('@/assets/done.svg')" />
        <span>{{ $t('transfer.steps.done.description') }}</span>
      </template>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Emit, Prop, Vue, Watch } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';

import type { RaidenTransfer, RaidenTransferStatus } from 'raiden-ts';

import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';
import type { Transfers } from '@/types';

@Component({
  components: { RaidenDialog, Spinner },
  computed: {
    ...mapState(['transfers']),
    ...mapGetters(['transfer']),
  },
})
export default class TransferProgressDialog extends Vue {
  @Prop({ required: true })
  error!: string;
  @Prop({ required: false })
  identifier?: BigNumber;
  @Prop({ required: true, type: Boolean })
  inProgress!: boolean;
  @Prop({ required: true, type: Boolean })
  visible!: boolean;

  transfers!: Transfers;
  transfer!: (paymentId: BigNumber) => RaidenTransfer | undefined;
  progress: RaidenTransferStatus[] = [];

  get title(): string {
    if (this.error) {
      return this.$t('transfer.error.title') as string;
    } else if (this.inProgress) {
      return this.$t('transfer.steps.transfer.title') as string;
    } else {
      return this.$t('transfer.steps.done.title') as string;
    }
  }

  @Watch('transfers')
  onTransfersUpdated() {
    this.updateProgress();
  }

  mounted() {
    this.updateProgress();
  }

  updateProgress() {
    if (this.identifier) {
      const transfer = this.transfer(this.identifier);
      if (transfer && !this.progress.includes(transfer.status)) {
        this.progress.push(transfer.status);
      }
    }
  }

  @Emit()
  dismiss(): boolean {
    return true;
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.transfer-progress-dialog {
  &__description {
    text-align: center;
    font-size: 14px;
    font-weight: 400;
    letter-spacing: 0;
    color: #ffffff;
    opacity: 1;
    padding-top: 10px;
  }

  &__progress-steps {
    padding: 0;
    list-style-type: none;
  }

  &__progress-step {
    display: flex;
    align-items: center;
    justify-content: center;

    &:after {
      content: ' ';
      width: 14px;
      height: 14px;
      background-image: url(../../assets/done.svg);
      background-size: 14px;
      display: inline-block;
      margin-left: 7px;
    }
  }

  &__error,
  &__done {
    height: 110px;
    width: 110px;
    margin: 0 auto;
  }
}
</style>
