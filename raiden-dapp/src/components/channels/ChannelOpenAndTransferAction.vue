<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Mixins } from 'vue-property-decorator';

import type { ChangeEvent } from 'raiden-ts';
import { EventTypes } from 'raiden-ts';

import ActionMixin from '@/mixins/action-mixin';
import type { ActionProgressStep } from '@/model/types';

type FixedRunOptions = {
  transferTokenAmount: BigNumber;
  paymentIdentifier: BigNumber;
};

const cleanOpenStep: ActionProgressStep = {
  title: 'channel-open-and-transfer-action.steps.open.title',
  description: 'channel-open-and-transfer-action.steps.open.description',
  active: false,
  completed: false,
  failed: false,
};

const cleanDepositStep: ActionProgressStep = {
  title: 'channel-open-and-transfer-action.steps.deposit.title',
  description: 'channel-open-and-transfer-action.steps.deposit.description',
  active: false,
  completed: false,
  failed: false,
};

const cleanTransferStep: ActionProgressStep = {
  title: 'channel-open-and-transfer-action.steps.transfer.title',
  description: 'channel-open-and-transfer-action.steps.transfer.description',
  active: false,
  completed: false,
  failed: false,
};

@Component
export default class ChannelOpenAndTransferAction extends Mixins(ActionMixin) {
  openStep = Object.assign({}, cleanOpenStep);
  depositStep = Object.assign({}, cleanDepositStep);
  transferStep = Object.assign({}, cleanTransferStep);

  get confirmButtonLabel(): string {
    return this.$t('channel-open-and-transfer-action.confirm-button-label') as string;
  }

  get steps(): ActionProgressStep[] {
    return [this.openStep, this.depositStep, this.transferStep];
  }

  resetStepsState(): void {
    this.openStep = Object.assign({}, cleanOpenStep);
    this.depositStep = Object.assign({}, cleanDepositStep);
    this.transferStep = Object.assign({}, cleanTransferStep);
  }

  handleOpenEvents(event: ChangeEvent<EventTypes, { txHash: string }>): void {
    switch (event.type) {
      case EventTypes.OPENED:
        this.openStep.completed = true;
        this.openStep.active = false;
        this.depositStep.active = true;
        break;

      default:
        break;
    }
  }

  async handleAction(options: {
    tokenAddress: string;
    partnerAddress: string;
    tokenAmount: BigNumber;
  }): Promise<void> {
    const { tokenAddress, partnerAddress, tokenAmount: depositTokenAmount } = options;
    const { transferTokenAmount, paymentIdentifier } = this.fixedRunOptions as FixedRunOptions;

    this.openStep.active = true;

    await this.$raiden.openChannel(
      tokenAddress,
      partnerAddress,
      depositTokenAmount,
      this.handleOpenEvents,
    );

    // Sleep for short while to let the partner node see the open channel event.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    this.depositStep.completed = true;
    this.depositStep.active = false;
    this.transferStep.active = true;

    await this.$raiden.transfer(
      tokenAddress,
      partnerAddress,
      transferTokenAmount,
      paymentIdentifier,
    );

    this.transferStep.completed = true;
    this.transferStep.active = false;
  }
}
</script>
