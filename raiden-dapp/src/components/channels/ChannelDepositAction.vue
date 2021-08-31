<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Mixins } from 'vue-property-decorator';

import ActionMixin from '@/mixins/action-mixin';
import type { ActionProgressStep } from '@/model/types';

const cleanDepositStep: ActionProgressStep = {
  title: 'transfer.steps.deposit.title',
  description: 'transfer.steps.deposit.description',
  active: false,
  completed: false,
  failed: false,
};

@Component
export default class ChannelDepositAction extends Mixins(ActionMixin) {
  depositStep = Object.assign({}, cleanDepositStep);

  get confirmButtonLabel(): string {
    return this.$t('channel-deposit.buttons.confirm') as string;
  }

  get steps(): ActionProgressStep[] {
    return [this.depositStep];
  }

  resetStepsState(): void {
    this.depositStep = Object.assign({}, cleanDepositStep);
  }

  async handleAction(options: {
    tokenAddress: string;
    partnerAddress: string;
    tokenAmount: BigNumber;
  }): Promise<void> {
    this.depositStep.active = true;

    await this.$raiden.deposit(options.tokenAddress, options.partnerAddress, options.tokenAmount);

    this.depositStep.completed = true;
  }
}
</script>
