<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Mixins, Prop } from 'vue-property-decorator';

import type { ChangeEvent } from 'raiden-ts';
import { EventTypes } from 'raiden-ts';

import ActionMixin from '@/mixins/action-mixin';
import type { ActionProgressStep } from '@/model/types';

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
  @Prop({ required: true })
  readonly transferTokenAmount!: BigNumber;

  @Prop({ required: true })
  readonly paymentIdentifier!: BigNumber;

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
    this.openStep.active = true;

    await this.$raiden.openChannel(
      options.tokenAddress,
      options.partnerAddress,
      options.tokenAmount,
      this.handleOpenEvents,
    );

    this.depositStep.completed = true;
    this.depositStep.active = false;
    this.transferStep.active = true;

    await this.$raiden.transfer(
      options.tokenAddress,
      options.partnerAddress,
      this.transferTokenAmount,
      this.paymentIdentifier,
    );

    this.transferStep.completed = true;
    this.transferStep.active = false;
  }
}
</script>
