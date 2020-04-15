<template>
  <div class="backup-state">
    <v-row no-gutters>
      <v-col cols="12" class="backup-state__description">
        {{ $t('backup-state.description') }}
      </v-col>
    </v-row>
    <v-list class="backup-state__buttons">
      <v-list-item
        :disabled="!isConnected"
        class="backup-state__buttons__download-state"
        @click="downloadState = true"
      >
        <div class="backup-state__buttons__download-state__icon">
          <v-img :src="require('../assets/state_download.png')"></v-img>
        </div>
        <v-list-item-content>
          <div class="backup-state__buttons__download-state__title">
            {{ $t('backup-state.download') }}
          </div>
        </v-list-item-content>
      </v-list-item>
      <v-list-item
        class="backup-state__buttons__upload-state"
        @click="uploadState = true"
      >
        <div class="backup-state__buttons__upload-state__icon">
          <v-img :src="require('../assets/state_upload.png')"></v-img>
        </div>
        <v-list-item-content>
          <div class="backup-state__buttons__upload-state__title">
            {{ $t('backup-state.upload') }}
          </div>
        </v-list-item-content>
      </v-list-item>
    </v-list>
    <download-state-dialog
      :visible="downloadState"
      @cancel="downloadState = false"
    >
    </download-state-dialog>
    <upload-state-dialog :visible="uploadState" @cancel="uploadState = false">
    </upload-state-dialog>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import DownloadStateDialog from '@/components/DownloadStateDialog.vue';
import UploadStateDialog from '@/components/UploadStateDialog.vue';

@Component({
  components: {
    DownloadStateDialog,
    UploadStateDialog
  },
  computed: { ...mapGetters(['isConnected']) }
})
export default class BackupState extends Vue {
  isConnected!: boolean;
  downloadState: boolean = false;
  uploadState: boolean = false;
}
</script>

<style scoped lang="scss">
@import '../scss/colors';

.backup-state {
  &__description {
    color: $secondary-text-color;
    font-size: 20px;
    padding: 50px 100px 0 100px;
    text-align: center;
  }

  &__buttons {
    background-color: transparent;
    margin: 0 auto;
    padding-top: 166px;
    width: 283px;

    &__download-state,
    &__upload-state {
      border: solid 2px $secondary-text-color;
      border-radius: 15px;
      height: 132px;
      margin-bottom: 35px;

      &__icon {
        padding: 0 10px 0 15px;
        width: 110px;
      }

      &__title {
        font-size: 22px;
        line-height: 30px;
        padding-left: 20px;
        text-align: center;
        max-width: 110px;
      }
    }
  }
}
</style>
