<template>
  <div data-cy="backup_state" class="backup-state">
    <v-row no-gutters>
      <v-col cols="12" class="backup-state__description">
        {{ $t('backup-state.description') }}
      </v-col>
    </v-row>
    <v-list class="backup-state__buttons">
      <v-tooltip color="#ea6464" bottom>
        <template #activator="{ on }">
          <div v-on="!isConnected ? on : null">
            <v-list-item
              :disabled="!isConnected"
              data-cy="backup_state_buttons_download_state"
              class="backup-state__buttons__download-state"
              @click="downloadState = true"
            >
              <div
                class="backup-state__buttons__download-state__icon"
                :class="{
                  'backup-state__buttons__download-state__icon disabled-icon': !isConnected,
                }"
              >
                <v-img :src="require('@/assets/state_download.png')" />
              </div>
              <v-list-item-content>
                <div class="backup-state__buttons__download-state__title">
                  {{ $t('backup-state.download') }}
                </div>
              </v-list-item-content>
            </v-list-item>
          </div>
        </template>
        <span>{{ $t('backup-state.disabled-download') }}</span>
      </v-tooltip>
      <v-tooltip color="#ea6464" bottom>
        <template #activator="{ on }">
          <div v-on="isConnected ? on : null">
            <v-list-item
              :disabled="isConnected"
              class="backup-state__buttons__upload-state"
              @click="uploadState = true"
            >
              <div
                class="backup-state__buttons__upload-state__icon"
                :class="{
                  'backup-state__buttons__upload-state__icon disabled-icon': isConnected,
                }"
              >
                <v-img :src="require('@/assets/state_upload.png')" />
              </div>
              <v-list-item-content>
                <div class="backup-state__buttons__upload-state__title">
                  {{ $t('backup-state.upload') }}
                </div>
              </v-list-item-content>
            </v-list-item>
          </div>
        </template>
        <span>{{ $t('backup-state.disabled-upload') }}</span>
      </v-tooltip>
    </v-list>
    <download-state-dialog :visible="downloadState" @cancel="downloadState = false" />
    <upload-state-dialog :visible="uploadState" @cancel="uploadState = false" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';

import DownloadStateDialog from '@/components/account/backup-state/DownloadStateDialog.vue';
import UploadStateDialog from '@/components/account/backup-state/UploadStateDialog.vue';

@Component({
  components: {
    DownloadStateDialog,
    UploadStateDialog,
  },
  computed: { ...mapState(['isConnected']) },
})
export default class BackupState extends Vue {
  isConnected!: boolean;
  downloadState = false;
  uploadState = false;
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.backup-state {
  &__description {
    color: $color-white;
    font-size: 16px;
    padding: 50px 100px 0 100px;
    text-align: center;
  }

  &__buttons {
    background-color: transparent;
    margin: 0 auto;
    padding-top: 100px;
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

      .disabled-icon {
        filter: grayscale(1);
      }

      &__title {
        font-size: 20px;
        line-height: 30px;
        padding-left: 20px;
        text-align: center;
        max-width: 110px;
      }
    }
  }
}
</style>
