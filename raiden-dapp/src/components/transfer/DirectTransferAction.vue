<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Mixins, Prop } from 'vue-property-decorator';

import ActionMixin from '@/mixins/action-mixin';
import type { ActionProgressStep } from '@/model/types';

const cleanTransferStep: ActionProgressStep = {
  title: 'direct-transfer-action.steps.transfer.title',
  description: 'direct-transfer-action.steps.transfer.description',
  active: false,
  completed: false,
  failed: false,
};

@Component
export default class DirectTransferAction extends Mixins(ActionMixin) {
  @Prop({ required: true })
  readonly transferTokenAmount!: BigNumber;

  @Prop({ required: true })
  readonly paymentIdentifier!: BigNumber;

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
    this.transferStep.active = true;

    const route = await this.$raiden.directRoute(
      options.tokenAddress,
      options.partnerAddress,
      this.transferTokenAmount,
    )

    if (route === undefined) {
      throw new Error(this.$t('direct-transfer-action.no-route-error') as string);
    }

    await this.$raiden.transfer(
      options.tokenAddress,
      options.partnerAddress,
      this.transferTokenAmount,
      this.paymentIdentifier,
      route,
    );

    this.transferStep.completed = true;
    this.transferStep.active = false;
  }
}
</script>
