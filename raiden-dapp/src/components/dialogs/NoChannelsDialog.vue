<template>
  <raiden-dialog class="no-channels-dialog" :visible="visible" hide-close>
    <v-card-title>{{ $t('transfer.no-channels-dialog.title') }}</v-card-title>
    <div>
      <v-img
        class="no-channels-dialog__warning"
        :src="require('@/assets/warning.svg')"
        height="132px"
        width="150px"
      />
      <action-button
        :text="$t('transfer.no-channels-dialog.button')"
        enabled
        @click="navigateToTokenSelect()"
      />
    </div>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator';

import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({
  components: { RaidenDialog, ActionButton },
})
export default class NoChannelsDialog extends Mixins(NavigationMixin) {
  @Prop({ required: true })
  visible!: boolean;
}
</script>

<style scoped lang="scss">
.no-channels-dialog {
  &__warning {
    /* Blue to red */
    filter: hue-rotate(165deg);
    margin: 0 auto;
    margin-top: 20px;
    margin-bottom: 45px;
  }
}
</style>
