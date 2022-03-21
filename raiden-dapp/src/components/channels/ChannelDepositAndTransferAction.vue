<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Mixins } from 'vue-property-decorator';

import ActionMixin from '@/mixins/action-mixin';
import type { ActionProgressStep } from '@/model/types';

type FixedRunOptions = {
  transferTokenAmount: BigNumber;
  paymentIdentifier: BigNumber;
};

const cleanDepositStep: ActionProgressStep = {
  title: 'channel-deposit-and-transfer-action.steps.deposit.title',
  description: 'channel-deposit-and-transfer-action.steps.deposit.description',
  active: false,
  completed: false,
  failed: false,
};

const cleanTransferStep: ActionProgressStep = {
  title: 'channel-deposit-and-transfer-action.steps.transfer.title',
  description: 'channel-deposit-and-transfer-action.steps.transfer.description',
  active: false,
  completed: false,
  failed: false,
};

@Component
export default class ChannelDepositAndTransferAction extends Mixins(ActionMixin) {
  depositStep = Object.assign({}, cleanDepositStep);
  transferStep = Object.assign({}, cleanTransferStep);

  get confirmButtonLabel(): string {
    return this.$t('channel-deposit-and-transfer-action.confirm-button-label') as string;
  }

  get steps(): ActionProgressStep[] {
    return [this.depositStep, this.transferStep];
  }

  resetStepsState(): void {
    this.depositStep = Object.assign({}, cleanDepositStep);
    this.transferStep = Object.assign({}, cleanTransferStep);
  }

  async handleAction(options: {
    tokenAddress: string;
    partnerAddress: string;
    tokenAmount: BigNumber;
  }): Promise<void> {
    const { tokenAddress, partnerAddress, tokenAmount: depositTokenAmount } = options;
    const { transferTokenAmount, paymentIdentifier } = this.fixedRunOptions as FixedRunOptions;

    this.depositStep.active = true;

    await this.$raiden.deposit(tokenAddress, partnerAddress, depositTokenAmount);

    // Sleep for short while to let the partner node see the channel deposit event.
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
