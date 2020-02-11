<template>
  <raiden-dialog
    class="error-dialog"
    :visible="description !== ''"
    @close="dismiss"
  >
    <v-card-title>
      <v-row align="center" justify="center">
        <v-col>
          <span>{{ title }}</span>
        </v-col>
      </v-row>
    </v-card-title>

    <v-card-actions>
      <v-row align="center" justify="center">
        <v-col cols="6">
          <v-img
            class="error-dialog__image"
            :src="require('../assets/error.png')"
          ></v-img>
        </v-col>
      </v-row>
    </v-card-actions>

    <v-card-text>
      <v-row align="center" justify="center">
        <span>{{ description }}</span>
      </v-row>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import RaidenDialog from '@/components/RaidenDialog.vue';

@Component({
  components: { RaidenDialog }
})
export default class ErrorDialog extends Vue {
  @Prop({ required: true })
  description!: string;
  @Prop({ required: true })
  title!: string;

  @Emit()
  dismiss() {}
}
</script>

<style scoped lang="scss">
.error-dialog {
  &__image {
    height: 110px;
    margin: 0 auto;
    width: 110px;
  }
}
</style>
