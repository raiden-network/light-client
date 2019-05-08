<template>
  <div class="modal-wrapper">
    <div class="modal-body">
      <v-layout class="modal-text" row align-center justify-center>
        <v-flex><slot></slot></v-flex>
      </v-layout>
      <v-layout row align-end justify-center class="action-buttons">
        <v-btn @click="cancelled()" class="text-capitalize cancel-button">
          Cancel
        </v-btn>
        <v-btn @click="confirmed()" class="text-capitalize">Close</v-btn>
      </v-layout>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';
import { assertNonNull, offset } from '@/utils/utils';

@Component({})
export default class InPlaceConfirmation extends Vue {
  private static OVERLAY_ID = 'inplace-confirmation-overlay';
  private static MODAL_WRAPPER_ID = 'inplace-confirmation-modal-wrapper';

  private overlay: HTMLDivElement | null = null;
  private modalWrapper: HTMLElement | null = null;
  private originalWrapper: HTMLElement | null = null;
  private app: Element | null = null;

  @Emit()
  public confirm() {}

  @Emit()
  public cancel() {}

  public confirmed() {
    this.confirm();
    this.removeDialog();
  }

  public cancelled() {
    this.cancel();
    this.removeDialog();
  }

  private removeDialog() {
    this.removeElement(InPlaceConfirmation.OVERLAY_ID);
    this.removeElement(InPlaceConfirmation.MODAL_WRAPPER_ID);
  }

  private createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = InPlaceConfirmation.OVERLAY_ID;
    this.overlay.className = 'v-overlay';
    this.overlay.classList.add('v-overlay--active');
    this.overlay.style.backgroundColor = 'rgba(30,30,30,0.75)';
  }

  private createModalWrapper() {
    this.modalWrapper = document.createElement('div');
    this.modalWrapper.style.position = 'absolute';
    this.modalWrapper.id = InPlaceConfirmation.MODAL_WRAPPER_ID;
  }

  private removeElement(elementId: string) {
    const element = document.getElementById(elementId);
    if (element) {
      element.remove();
    }
  }

  private adjustWrapperPosition() {
    const wrapper = assertNonNull(this.modalWrapper);
    const container = assertNonNull(this.originalWrapper);
    const { top, left } = offset(container);
    wrapper.style.top = `${top}px`;
    wrapper.style.left = `${left}px`;
    wrapper.style.width = `${container.offsetWidth}px`;
    wrapper.style.height = `${container.offsetHeight}px`;
  }

  created() {
    this.createOverlay();
    this.createModalWrapper();

    const app = assertNonNull(
      document.querySelector('[data-app]'),
      '[data-app] is missing'
    );
    this.app = app;

    app.insertBefore(this.overlay!, app.firstChild);

    window.addEventListener('resize', this.adjustWrapperPosition);
  }

  mounted() {
    const modal = document.getElementsByClassName('modal-body')[0];
    const wrapper = assertNonNull(this.modalWrapper);
    const app = assertNonNull(this.app);
    const overlay = assertNonNull(this.overlay);

    this.originalWrapper = modal.parentElement;

    this.adjustWrapperPosition();

    wrapper.style.zIndex = '234';
    wrapper.append(modal);

    app.insertBefore(wrapper, overlay.nextSibling);
  }

  destroy() {
    this.removeDialog();
    window.removeEventListener('resize', this.adjustWrapperPosition);
  }
}
</script>

<style scoped lang="scss">
.modal-wrapper {
  height: 210px;
}
.modal-body {
  height: 210px;
  padding: 40px;
  background-color: #e4e4e4;
  box-shadow: 10px 10px 15px 0 rgba(0, 0, 0, 0.3);
}

.modal-text > * {
  height: 100px;
  color: #050505;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

.action-buttons button {
  width: 125px;
  height: 40px;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
  border-radius: 29px;
  margin-left: 25px;
  margin-right: 25px;
}

.cancel-button {
  background-color: transparent !important;
  border: 2px solid #050505;
  color: #050505;
}
</style>
