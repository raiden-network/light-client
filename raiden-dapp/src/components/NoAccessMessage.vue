<template>
  <v-alert :value="true" color="error" icon="warning" class="no-access-message">
    <div class="font-weight-light no-access-message__message">
      <span v-if="networkUnsupported">
        {{ $t('no-access.unsupported-network') }}
      </span>
      <span v-if="initializationFailed">
        {{ $t('no-access.sdk-initialization-failure') }}
      </span>
      <span v-if="rdnStateMigration">
        {{ $t('no-access.rdn-state-migration') }}
      </span>
      <span v-else>{{ $t('no-access.generic-error') }}</span>
    </div>
  </v-alert>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { DeniedReason } from '@/model/types';

@Component({})
export default class NoAccessMessage extends Vue {
  @Prop({ required: true })
  reason!: DeniedReason;

  get networkUnsupported(): boolean {
    return this.reason === DeniedReason.UNSUPPORTED_NETWORK;
  }

  get initializationFailed(): boolean {
    return this.reason === DeniedReason.INITIALIZATION_FAILED;
  }

  get rdnStateMigration(): boolean {
    return this.reason === DeniedReason.RDN_STATE_MIGRATION;
  }
}
</script>

<style scoped lang="scss">
.no-access-message {
  &__message {
    font-size: 16px;
    line-height: 20px;
  }
}
</style>
