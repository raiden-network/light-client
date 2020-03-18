<template>
  <div class="backup-state">
    <v-row no-gutters>
      <v-col cols="12" class="backup-state__description">
        {{ $t('backup-state.description') }}
      </v-col>
    </v-row>
    <v-list class="backup-state__buttons">
      <v-list-item class="backup-state__buttons__download-state">
        <div class="backup-state__buttons__download-state__icon">
          <v-img :src="require('../assets/state_download.png')"></v-img>
        </div>
        <v-list-item-content>
          <div class="backup-state__buttons__download-state__title">
            {{ $t('backup-state.download') }}
          </div>
        </v-list-item-content>
      </v-list-item>
      <v-list-item class="backup-state__buttons__upload-state">
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
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class BackupState extends Vue {}
</script>

<style scoped lang="scss">
@import '../scss/colors';

.backup-state {
  &__description {
    color: $secondary-text-color;
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
