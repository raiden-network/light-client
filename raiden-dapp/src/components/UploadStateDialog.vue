<template>
  <raiden-dialog class="upload-state" :visible="visible" @close="cancel">
    <v-card-title>
      {{ $t('backup-state.upload') }}
    </v-card-title>

    <v-card-text v-if="dropzoneError">
      {{ 'There is an dropzone error' }}
    </v-card-text>

    <v-card-actions v-else-if="uploadingState">
      <v-progress-circular indeterminate></v-progress-circular>
    </v-card-actions>

    <v-card-actions v-else>
      <div
        class="upload-state__dropzone"
        :class="{ 'upload-state__dropzone active-dropzone': activeDropzone }"
        @dragenter="onDropzoneEnter"
        @dragleave="onDropzoneLeave"
        @dragover.prevent
        @drop="onDropzoneDrop"
      >
        <v-row class="upload-state__dropzone__icon" justify="center" no-gutters>
          <v-icon
            class="upload-state__dropzone__icon--inactive-dropzone"
            :class="{
              'upload-state__dropzone__icon--active-dropzone': activeDropzone
            }"
            size="90px"
          >
            mdi-upload
          </v-icon>
        </v-row>
        <v-row
          class="upload-state__dropzone__description"
          justify="center"
          no-gutters
        >
          {{ $t('backup-state.upload-drag-and-drop') }}
        </v-row>
        <v-row
          class="upload-state__dropzone__description"
          justify="center"
          no-gutters
        >
          {{ $t('backup-state.upload-divider') }}
        </v-row>
        <v-row class="upload-state__dropzone__button">
          <input ref="stateInput" type="file" hidden />
          <action-button
            :enabled="!activeDropzone ? true : false"
            ghost
            :text="$t('backup-state.upload-button')"
            @click="chooseStateFile()"
          />
        </v-row>
      </div>
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Prop, Emit, Vue } from 'vue-property-decorator';
import RaidenDialog from '@/components/RaidenDialog.vue';
import ActionButton from '@/components/ActionButton.vue';

@Component({
  components: {
    RaidenDialog,
    ActionButton
  }
})
export default class UploadStateDialog extends Vue {
  dragCount: number = 0;
  activeDropzone: boolean = false;
  dropzoneError: boolean = false;
  uploadingState: boolean = false;

  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;

  @Emit()
  cancel() {}

  onDropzoneEnter(e) {
    e.preventDefault();
    this.dragCount++;
    this.activeDropzone = true;
  }

  onDropzoneLeave(e) {
    e.preventDefault();
    this.dragCount--;

    if (this.dragCount <= 0) {
      this.activeDropzone = false;
    }
  }

  onDropzoneDrop(e) {
    e.preventDefault();
    this.activeDropzone = false;
    const uploadedFile = e.dataTransfer.files;

    if (uploadedFile.length > 1) {
      this.dropzoneError = true;
      setTimeout(() => {
        this.dropzoneError = false;
      }, 2000);
    } else {
      let reader = new FileReader();
      reader.onload = e => {
        let retrievedState = String(e.target.result);
        this.uploadState(retrievedState);
      };
      reader.readAsText(uploadedFile[0]);
    }
  }

  chooseStateFile() {
    // TODO, add functionality
    (this.$refs.stateInput as any).click();
  }

  uploadState(uploadedState: string) {
    // TODO, work on spinner
    this.uploadingState = true;
    this.$store.commit('backupState', uploadedState);
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';

.upload-state {
  &__dropzone {
    border: dashed 2px $secondary-button-color;
    display: flex;
    flex-direction: column;
    height: 270px;
    margin: 0 auto;
    width: 300px;

    &__icon {
      &--inactive-dropzone {
        color: $secondary-button-color;
      }
      &--active-dropzone {
        color: $primary-color;
      }
    }

    &__description {
      flex: none;
    }

    &__button {
      flex: none;
      padding: 10px 0 25px 2px;
    }
  }
}

.active-dropzone {
  border: dashed 2px $primary-color;
}
</style>
