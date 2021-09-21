<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Mixins } from 'vue-property-decorator';

import type { RaidenPaths } from 'raiden-ts';

import ActionMixin from '@/mixins/action-mixin';
import type { ActionProgressStep } from '@/model/types';

type FixedRunOptions = {
  transferTokenAmount: BigNumber;
  paymentIdentifier: BigNumber;
  route: RaidenPaths[number];
};

const cleanTransferStep: ActionProgressStep = {
  title: 'mediated-transfer-action.steps.transfer.title',
  description: 'mediated-transfer-action.steps.transfer.description',
  active: false,
  completed: false,
  failed: false,
};

@Component
export default class MediatedTransferAction extends Mixins(ActionMixin) {
  transferStep = Object.assign({}, cleanTransferStep);

  get confirmButtonLabel(): string {
    return this.$t('mediated-transfer-action.confirm-button-label') as string;
  }

  get steps(): ActionProgressStep[] {
    return [this.transferStep];
  }

  resetStepsState(): void {
    this.transferStep = Object.assign({}, cleanTransferStep);
  }

  async handleAction(options: { tokenAddress: string; partnerAddress: string }): Promise<void> {
    const { tokenAddress, partnerAddress } = options;
    const { transferTokenAmount, paymentIdentifier, route } = this
      .fixedRunOptions as FixedRunOptions;
    this.transferStep.active = true;

    await this.$raiden.transfer(
      tokenAddress,
      partnerAddress,
      transferTokenAmount,
      paymentIdentifier,
      [route],
    );

    this.transferStep.completed = true;
    this.transferStep.active = false;
  }
}
</script>
