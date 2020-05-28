<template>
  <raiden-dialog
    :visible="visible"
    class="receiving-disabled-dialog"
    @close="dismiss"
  >
    <v-card-title class="receiving-disabled-dialog__title">
      {{ $t('receiving-disabled-dialog.title') }}
    </v-card-title>

    <v-card-text>
      <v-row align="center" justify="center" no-gutters>
        <v-col cols="6">
          <v-img
            class="receiving-disabled-dialog__icon"
            :src="require('@/assets/warning.svg')"
            height="110px"
          ></v-img>
        </v-col>
        <v-col cols="12">
          <div class="receiving-disabled-dialog__description">
            <span>
              {{ $t('receiving-disabled-dialog.body') }}
            </span>
          </div>
        </v-col>
      </v-row>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';

@Component({
  components: { RaidenDialog }
})
export default class ReceivingDisabledDialog extends Vue {
  @Prop({ required: true, type: Boolean })
  visible!: boolean;

  @Emit()
  dismiss() {}
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.receiving-disabled-dialog {
  &__title {
    padding-bottom: 32px !important;
  }

  &__icon {
    ::v-deep {
      .v-image {
        &__image {
          /* blue to red */
          filter: hue-rotate(165deg);
        }
      }
    }
  }

  &__description {
    text-align: center;
    font-size: 14px;
    font-weight: 400;
    letter-spacing: 0;
    color: #ffffff;
    opacity: 1;
    padding-top: 32px;
  }
}
</style>
