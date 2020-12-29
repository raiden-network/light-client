<template>
  <transition v-if="show" name="delay">
    <v-snackbar v-model="show" class="receiving-ongoing-snackbar" timeout="-1" color="primary">
      <span class="receiving-ongoing-snackbar__warning">
        {{ $t('transfer.receiving-transfer-snackbar') }}
      </span>
    </v-snackbar>
  </transition>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import { RaidenTransfer } from 'raiden-ts';
import { Transfers } from '@/types';

@Component({
  computed: {
    ...mapGetters(['pendingTransfers']),
  },
})
export default class ReceivingOngoingSnackbar extends Vue {
  pendingTransfers!: Transfers;

  get pendingReceivedTransfers(): RaidenTransfer[] {
    return Object.values(this.pendingTransfers).filter(
      (transfer) => transfer.direction === 'received',
    );
  }

  get show(): boolean {
    return Object.keys(this.pendingReceivedTransfers).length > 0;
  }
}
</script>

<style scoped lang="scss">
::v-deep {
  .v-snack {
    &__content {
      text-align: center;
    }
  }
}

// This makes sure that the component is shown a little bit longer.
// This is meant to prevent flickering as transfers are blazing fast.
.delay-leave-active {
  transition-delay: 1.5s;
}

.receiving-ongoing-snackbar {
  &__warning {
    font-size: 16px;
    margin-left: 8px;
  }
}
</style>
