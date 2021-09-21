import type { CreateElement, VNode } from 'vue';
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { VCardText, VCardTitle } from 'vuetify/lib';

import ActionProgressCard from '@/components/ActionProgressCard.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import type { ActionProgressStep } from '@/model/types';

@Component
export default class ChannelDepositAction extends Vue {
  @Prop({ type: Boolean, default: false })
  readonly showProgressInDialog!: boolean;

  @Prop({ type: String, default: '' })
  readonly dialogTitle!: string;

  @Prop({ required: false })
  readonly fixedRunOptions?: Record<string, unknown>;

  @Prop({ type: Number, default: 5000 })
  readonly completionDelayTimeout!: number;

  completed = false;
  error: Error | null = null;
  progressVisible = false;
  progressDialogClosed = false;

  get confirmButtonLabel(): string {
    return ''; // Set by components using mixing.
  }

  get steps(): ActionProgressStep[] {
    return [
      // Defined by components using the mixin.
    ];
  }

  get dialogClosable(): boolean {
    return this.completed || this.error != null;
  }

  resetStepsState(): void {
    // Implemented by components using the mixin.
  }

  resetProgressState(): void {
    this.error = null;
    this.completed = false;
    this.progressVisible = false;
    this.progressDialogClosed = false;
  }

  resetState(): void {
    this.resetProgressState();
    this.resetStepsState();
  }

  async handleAction(_options: { [key: string]: unknown }): Promise<void> {
    // Implemented by components using the mixin.
  }

  setActiveStepAsFailed(): void {
    for (const step of this.steps) {
      if (step.active) {
        step.failed = true;
        return;
      }
    }
  }

  async runAction(options: { [key: string]: unknown }): Promise<void> {
    try {
      this.emitStarted();
      this.resetState();
      this.progressVisible = true;
      await this.handleAction(options);
      this.completed = true;
      await this.delayCompletedAction();
      this.progressVisible = false;
      this.emitCompleted();
    } catch (error) {
      this.setActiveStepAsFailed();
      this.error = error as Error;
      this.emitFailed(error as Error);
    }
  }

  async delayCompletedAction(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.completionDelayTimeout));
  }

  closeProgressDialog(): void {
    if (this.dialogClosable) {
      this.progressDialogClosed = true;
      this.emitDialogClosed();
    }
  }

  render(createElement: CreateElement): VNode {
    const { runAction, confirmButtonLabel, steps, completed, error, dialogClosable } = this;
    const progressCard = createElement(ActionProgressCard, { props: { steps, completed, error } });
    const dialogTitle = createElement(VCardTitle, `${this.dialogTitle}`);
    const dialogText = createElement(VCardText, [progressCard]);
    const dialogVisible = this.progressVisible && !this.progressDialogClosed;
    const dialog = createElement(
      RaidenDialog,
      {
        props: { visible: dialogVisible, hideClose: !dialogClosable },
        on: { close: this.closeProgressDialog },
      },
      [dialogTitle, dialogText],
    );

    const slot = this.$scopedSlots.default?.({ runAction, confirmButtonLabel });
    const slotVisible = !this.progressVisible || this.showProgressInDialog;

    const children = slotVisible ? [slot?.[0]] : [];

    if (this.progressVisible) {
      children.push(this.showProgressInDialog ? dialog : progressCard);
    }

    return createElement('div', children);
  }

  @Emit('started')
  emitStarted(): void {
    // pass
  }

  @Emit('completed')
  emitCompleted(): void {
    // pass
  }

  @Emit('failed')
  emitFailed(error: Error): Error {
    return error;
  }

  @Emit('dialogClosed')
  emitDialogClosed(): void {
    // pass
  }
}
