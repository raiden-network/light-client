<template>
  <raiden-dialog class="pfs-fees-dialog" :visible="visible" hide-close>
    <v-card-text>
      <spinner v-if="!pfsFeesPaid" />

      <v-img
        v-if="pfsFeesPaid"
        class="pfs-fees-dialog__done my-4"
        :src="require('@/assets/done.svg')"
      />

      <span>{{ statusText }}</span>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';

@Component({
  components: { RaidenDialog, Spinner },
})
export default class PfsFeesDialog extends Vue {
  @Prop({ required: true, type: Boolean })
  visible!: boolean;
  @Prop({ required: true })
  pfsFeesPaid!: boolean;
  @Prop({ required: true })
  freePfs!: boolean;

  get statusText(): string {
    if (this.freePfs) {
      return this.$t('transfer.steps.request-route.searching-for-route') as string;
    } else if (!this.pfsFeesPaid) {
      return this.$t('transfer.steps.request-route.in-progress') as string;
    } else {
      return this.$t('transfer.steps.request-route.done') as string;
    }
  }
}
</script>

<style lang="scss">
.pfs-fees-dialog {
  &__done {
    height: 110px;
    width: 110px;
    margin: 0 auto;
  }
}
</style>
