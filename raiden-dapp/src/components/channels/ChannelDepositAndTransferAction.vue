<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Mixins, Prop } from 'vue-property-decorator';

import ActionMixin from '@/mixins/action-mixin';
import type { ActionProgressStep } from '@/model/types';

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
  @Prop({ required: true })
  readonly transferTokenAmount!: BigNumber;

  @Prop({ required: true })
  readonly paymentIdentifier!: BigNumber;

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
    this.depositStep.active = true;

    await this.$raiden.deposit(options.tokenAddress, options.partnerAddress, options.tokenAmount);

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
