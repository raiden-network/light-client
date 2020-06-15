<template>
  <raiden-dialog
    :visible="visible"
    class="transfer-progress-dialog"
    @close="dismiss"
  >
    <v-card-title>
      <span v-if="error">
        {{ $t('transfer.error.title') }}
      </span>
      <span v-else-if="inProgress">
        {{ $t('transfer.steps.transfer.title') }}
      </span>
      <span v-else>
        {{ $t('transfer.steps.done.title') }}
      </span>
    </v-card-title>
    <v-card-text>
      <v-row>
        <v-col cols="12">
          <ul class="transfer-progress-dialog__progress-steps">
            <li
              v-for="(status, index) in progress"
              :key="index"
              class="transfer-progress-dialog__progress-step"
            >
              {{ $t(`progress-steps.transfer.${status}`) }}
            </li>
          </ul>
        </v-col>
      </v-row>
      <v-row align="center" justify="center">
        <v-col cols="6">
          <div v-if="error">
            <v-img
              :src="require('@/assets/error.png')"
              class="transfer-progress-dialog--error"
            ></v-img>
          </div>
          <v-progress-linear
            v-else-if="inProgress"
            indeterminate
            color="primary"
            class="transfer-progress-dialog--progress"
          />
        </v-col>
      </v-row>
      <v-row>
        <v-col cols="12">
          <div class="transfer-progress-dialog__description">
            <span v-if="error">
              {{ error }}
            </span>
            <span v-else-if="!inProgress">
              {{ $t('transfer.steps.done.description') }}
            </span>
          </div>
        </v-col>
      </v-row>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue, Watch } from 'vue-property-decorator';
import { RaidenTransferStatus, RaidenTransfer } from 'raiden-ts';
import { mapGetters, mapState } from 'vuex';
import { BigNumber } from 'ethers/utils';

import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import { Transfers } from '@/types';

@Component({
  components: { RaidenDialog },
  computed: {
    ...mapState(['transfers']),
    ...mapGetters(['transfer'])
  }
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
  dismiss() {}
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

  &--progress {
    margin-top: 20px;
  }

  &--done {
    margin-top: 26px;
    border-radius: 50%;
    width: 125px;
  }
}
</style>
