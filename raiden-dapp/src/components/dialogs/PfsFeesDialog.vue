<template>
  <raiden-dialog :visible="visible" hide-close>
    <v-card-actions>
      <v-row v-if="!pfsFeesPaid">
        <spinner />
      </v-row>
      <v-row v-else align="center" justify="center">
        <v-col cols="6">
          <v-img :src="require('@/assets/done.svg')"> </v-img>
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
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';

@Component({
  components: { RaidenDialog, Spinner }
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
