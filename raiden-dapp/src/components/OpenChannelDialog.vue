<template>
  <raiden-dialog :visible="visible" @close="cancel">
    <v-card-title>
      <v-row align="center" justify="center">
        <v-col>
          <span>
            {{}}
          </span>
        </v-col>
      </v-row>
    </v-card-title>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import RaidenDialog from '@/components/RaidenDialog.vue';
import { StepDescription } from '@/model/types';
@Component({
  components: {
    RaidenDialog
  }
})
export default class OpenChannelDialog extends Vue {
  @Prop({ required: true })
  visible!: boolean;
  @Prop({ required: true })
  steps!: StepDescription[];

  @Emit()
  cancel() {}
}
</script>

<style scoped lang="scss"></style>
