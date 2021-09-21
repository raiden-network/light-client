<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Mixins, Prop } from 'vue-property-decorator';

import type { RaidenPaths } from 'raiden-ts';

import ActionMixin from '@/mixins/action-mixin';
import type { ActionProgressStep } from '@/model/types';

const cleanTransferStep: ActionProgressStep = {
  title: 'mediated-transfer-action.steps.transfer.title',
  description: 'mediated-transfer-action.steps.transfer.description',
  active: false,
  completed: false,
  failed: false,
};

@Component
export default class MediatedTransferAction extends Mixins(ActionMixin) {
  @Prop({ required: true })
  readonly transferTokenAmount!: BigNumber;

  @Prop({ required: true })
  readonly paymentIdentifier!: BigNumber;

  @Prop({ required: true })
  readonly route!: RaidenPaths[number];

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
    this.transferStep.active = true;

    await this.$raiden.transfer(
      options.tokenAddress,
      options.partnerAddress,
      this.transferTokenAmount,
      this.paymentIdentifier,
      [this.route],
    );

    this.transferStep.completed = true;
    this.transferStep.active = false;
  }
}
</script>
