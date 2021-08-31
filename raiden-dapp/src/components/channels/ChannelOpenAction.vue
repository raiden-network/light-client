<script lang="ts">
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';
import { Component, Mixins } from 'vue-property-decorator';

import type { ChangeEvent } from 'raiden-ts';
import { EventTypes } from 'raiden-ts';

import ActionMixin from '@/mixins/action-mixin';
import type { ActionProgressStep } from '@/model/types';

const cleanOpenStep: ActionProgressStep = {
  title: 'open-channel.steps.open.title',
  description: 'open-channel.steps.open.description',
  active: false,
  completed: false,
  failed: false,
};

const cleanTransferStep: ActionProgressStep = {
  title: 'open-channel.steps.transfer.title',
  description: 'open-channel.steps.transfer.description',
  active: false,
  completed: false,
  failed: false,
};

const cleanDepositStep: ActionProgressStep = {
  title: 'open-channel.steps.deposit.title',
  description: 'open-channel.steps.deposit.description',
  active: false,
  completed: false,
  failed: false,
};

@Component
export default class ChannelOpenAction extends Mixins(ActionMixin) {
  openStep = Object.assign({}, cleanOpenStep);
  transferStep = Object.assign({}, cleanTransferStep);
  depositStep = Object.assign({}, cleanDepositStep);
  withDeposit = false;

  get confirmButtonLabel(): string {
    return this.$t('open-channel.open-button') as string;
  }

  get steps(): ActionProgressStep[] {
    if (this.withDeposit) {
      return [this.openStep, this.transferStep, this.depositStep];
    } else {
      return [this.openStep];
    }
  }

  resetStepsState(): void {
    this.openStep = Object.assign({}, cleanOpenStep);
    this.transferStep = Object.assign({}, cleanTransferStep);
    this.depositStep = Object.assign({}, cleanDepositStep);
  }

  handleOpenEvents(event: ChangeEvent<EventTypes, { txHash: string }>): void {
    switch (event.type) {
      case EventTypes.OPENED:
        this.openStep.completed = true;
        this.openStep.active = false;
        this.transferStep.active = true;
        break;

      case EventTypes.CONFIRMED:
        this.transferStep.completed = true;
        this.transferStep.active = false;
        this.depositStep.active = true;
        break;

      case EventTypes.DEPOSITED:
        this.depositStep.completed = true;
        this.depositStep.active = false;
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
    this.withDeposit = options.tokenAmount.gt(constants.Zero);
    this.openStep.active = true;

    await this.$raiden.openChannel(
      options.tokenAddress,
      options.partnerAddress,
      options.tokenAmount,
      this.handleOpenEvents,
    );
  }
}
</script>
