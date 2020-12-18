<template>
  <v-snackbar v-model="snackbarVisible" :timeout="-1" color="primary">
    <span class="receiving-ongoing-snackbar__warning">
      {{ $t('transfer.receiving-transfer-snackbar') }}
    </span>
  </v-snackbar>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import { of, Subject, Subscription, timer } from 'rxjs';
import { debounce, distinctUntilChanged } from 'rxjs/operators';
import { Transfers } from '@/types';
import { RaidenTransfer } from 'raiden-ts';

@Component({
  computed: {
    ...mapGetters(['pendingTransfers']),
  },
})
export default class ReceivingOngoingSnackbar extends Vue {
  pendingTransfers!: Transfers;
  $receivingTransfersPending!: Subject<boolean>;
  snackbarVisible = false;
  sub!: Subscription;

  get pendingReceivingTransfers(): RaidenTransfer[] {
    const pendingTransfers = Object.values(this.pendingTransfers) as RaidenTransfer[];
    return pendingTransfers.filter((transfer) => transfer.direction === 'received');
  }

  @Watch('pendingReceivingTransfers')
  updatedPendingReceivedTransfers(transfers: RaidenTransfer[]) {
    this.$receivingTransfersPending.next(transfers.length > 0);
  }

  created(): void {
    this.$receivingTransfersPending = new Subject<boolean>();

    this.sub = this.$receivingTransfersPending
      .pipe(
        distinctUntilChanged(),
        debounce((pending) => (pending ? of(1) : timer(5000))),
      )
      .subscribe((pending) => (this.snackbarVisible = pending));
  }

  destroyed(): void {
    this.sub.unsubscribe();
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

.receiving-ongoing-snackbar {
  &__warning {
    flex: 1;
    font-size: 16px;
    margin-left: 8px;
  }
}
</style>
