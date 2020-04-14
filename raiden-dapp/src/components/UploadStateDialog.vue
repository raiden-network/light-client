<template>
  <raiden-dialog class="upload-state" :visible="visible" @close="cancel">
    <v-card-title>{{ $t('backup-state.upload') }}</v-card-title>

    <v-card-text v-if="dropzoneErrorMessage">
      <v-row justify="center" class="upload-state__error" no-gutters>
        {{ $t('backup-state.upload-error') }}
      </v-row>
    </v-card-text>

    <v-card-actions v-else-if="uploadingStateProgress">
      <v-row justify="center" no-gutters>
        <v-progress-circular
          class="upload-state__progress"
          :size="110"
          :width="7"
          indeterminate
        ></v-progress-circular>
      </v-row>
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
          <input ref="stateInput" type="file" hidden @change="onFileSelect" />
          <action-button
            :enabled="!activeDropzone ? true : false"
            ghost
            :text="$t('backup-state.upload-button')"
            @click="$refs.stateInput.click()"
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
  dropzoneErrorMessage: boolean = false;
  uploadingStateProgress: boolean = false;

  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;

  @Emit()
  cancel() {}

  onDropzoneEnter(e: DragEvent) {
    e.preventDefault();
    this.dragCount++;
    this.activeDropzone = true;
  }

  onDropzoneLeave(e: DragEvent) {
    e.preventDefault();
    this.dragCount--;

    if (this.dragCount <= 0) {
      this.activeDropzone = false;
    }
  }

  onDropzoneDrop(e: DragEvent) {
    e.preventDefault();
    this.activeDropzone = false;

    if (!e.dataTransfer?.files) {
      this.dropzoneError();
    }

    const uploadedFile = e.dataTransfer?.files;
    this.uploadState(uploadedFile!);
  }

  onFileSelect(e: Event) {
    if (!(e.target as HTMLInputElement).files) {
      this.dropzoneError();
    }

    const uploadedFile = (e.target as HTMLInputElement).files;
    this.uploadState(uploadedFile!);
  }

  dropzoneError() {
    this.uploadingStateProgress = false;
    this.dropzoneErrorMessage = true;
    setTimeout(() => {
      this.dropzoneErrorMessage = false;
    }, 2000);
  }

  uploadState(uploadedFile: FileList) {
    if (uploadedFile.length > 1) {
      this.dropzoneError();
    }

    let reader = new FileReader();
    /* istanbul ignore next */
    reader.onload = e => {
      if (!e.target?.result) {
        this.dropzoneError();
      }

      try {
        this.uploadingStateProgress = true;
        const retrievedState = e.target?.result;
        JSON.parse(String(retrievedState));
        this.$store.commit('backupState', retrievedState);
        setTimeout(() => {
          this.uploadingStateProgress = false;
          this.cancel();
        }, 1000);
      } catch (err) {
        this.dropzoneError();
      }
    };
    reader.readAsText(uploadedFile[0]);
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';

.upload-state {
  &__error {
    color: $error-color;
    flex-direction: column;
    font-size: 16px;
    height: 307px;
  }

  &__progress {
    color: $secondary-color;
  }
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
