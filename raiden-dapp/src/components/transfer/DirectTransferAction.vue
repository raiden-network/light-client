<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Mixins } from 'vue-property-decorator';

import ActionMixin from '@/mixins/action-mixin';
import type { ActionProgressStep } from '@/model/types';

type FixedRunOptions = {
  transferTokenAmount: BigNumber;
  paymentIdentifier: BigNumber;
};

const cleanTransferStep: ActionProgressStep = {
  title: 'direct-transfer-action.steps.transfer.title',
  description: 'direct-transfer-action.steps.transfer.description',
  active: false,
  completed: false,
  failed: false,
};

@Component
export default class DirectTransferAction extends Mixins(ActionMixin) {
  transferStep = Object.assign({}, cleanTransferStep);

  get confirmButtonLabel(): string {
    return this.$t('direct-transfer-action.confirm-button-label') as string;
  }

  get steps(): ActionProgressStep[] {
    return [this.transferStep];
  }

  resetStepsState(): void {
    this.transferStep = Object.assign({}, cleanTransferStep);
  }

  async handleAction(options: { tokenAddress: string; partnerAddress: string }): Promise<void> {
    const { tokenAddress, partnerAddress } = options;
    const { transferTokenAmount, paymentIdentifier } = this.fixedRunOptions as FixedRunOptions;

    this.transferStep.active = true;

    const route = await this.$raiden.directRoute(
      tokenAddress,
      partnerAddress,
      transferTokenAmount,
    );

    if (route === undefined) {
      throw new Error(this.$t('direct-transfer-action.no-route-error') as string);
    }

    await this.$raiden.transfer(
      tokenAddress,
      partnerAddress,
      transferTokenAmount,
      paymentIdentifier,
      route,
    );

    this.transferStep.completed = true;
    this.transferStep.active = false;
  }
}
</script>
