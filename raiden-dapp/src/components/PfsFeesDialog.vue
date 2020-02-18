<template>
  <raiden-dialog class="pfs-fees-dialog" :visible="visible" :hide-close="true">
    <v-card-actions>
      <v-row v-if="!pfsFeesPaid" align="center" justify="center">
        <v-progress-circular
          class="pfs-fees-dialog__progress"
          :size="110"
          :width="7"
          indeterminate
        >
        </v-progress-circular>
      </v-row>
      <v-row v-else align="center" justify="center">
        <v-col cols="6">
          <v-img
            class="pfs-fees-dialog__done"
            :src="require('../assets/done.svg')"
          >
          </v-img>
        </v-col>
      </v-row>
    </v-card-actions>

    <v-card-text>
      <span v-if="!pfsFeesPaid && !freePfs">
        {{ $t('transfer.steps.request-route.in-progress') }}
      </span>
      <span v-else-if="freePfs">
        {{ $t('transfer.steps.request-route.searching-for-route') }}
      </span>
      <span v-else>
        {{ $t('transfer.steps.request-route.done') }}
      </span>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import RaidenDialog from '@/components/RaidenDialog.vue';

@Component({
  components: {
    RaidenDialog
  }
})
export default class PfsFeesDialog extends Vue {
  @Prop({ required: true, type: Boolean })
  visible!: boolean;
  @Prop({ required: true })
  pfsFeesPaid!: boolean;
  @Prop({ required: true })
  freePfs!: boolean;
}
</script>

<style scoped lang="scss">
@import '../scss/colors';

.pfs-fees-dialog {
  &__progress {
    color: $secondary-color;
  }
}
</style>
