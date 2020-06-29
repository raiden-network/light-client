<template>
  <raiden-dialog
    class="connect"
    :visible="visible"
    :hide-close="hideClose"
    @close="close"
  >
    <v-card-title>
      {{ $t('home.connect-dialog.title') }}
    </v-card-title>
    <div v-if="hasProvider">
      <div class="connect__button">
        <action-button
          :text="$t('home.connect-dialog.raiden-account')"
          :enabled="!connecting"
          :loading="connecting"
          @click="connect()"
        />
      </div>
      <p class="text-center connect__description">
        {{ $t('home.connect-dialog.description-raiden-account') }}
      </p>
      <p class="text-center connect__description">
        {{ $t('home.connect-dialog.description-web3-account') }}
      </p>
    </div>
    <no-access-message v-if="accessDenied" :reason="accessDenied" />
    <v-card-text v-if="!hasProvider">
      <div class="text-center">
        {{ $t('home.connect-dialog.no-provider') }}
      </div>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Prop, Emit, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { DeniedReason } from '@/model/types';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import ActionButton from '@/components/ActionButton.vue';
import NoAccessMessage from '@/components/NoAccessMessage.vue';

@Component({
  components: {
    RaidenDialog,
    ActionButton,
    NoAccessMessage
  },
  computed: mapState(['accessDenied'])
})
export default class ConnectDialog extends Vue {
  hideClose: boolean = false;
  accessDenied!: DeniedReason;

  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;
  @Prop({ default: false, required: true, type: Boolean })
  connecting!: boolean;
  @Prop({ required: true })
  hasProvider!: boolean;

  @Emit()
  close() {}

  @Emit()
  connect() {
    this.$store.commit('updateSettings', {
      ...this.$store.state.settings,
      isFirstTimeConnect: false
    });
  }
}
</script>

<style lang="scss" scoped>
.connect {
  &__button {
    margin: 45px 0 28px 0;
  }

  &__raiden-account {
    margin: 28px 0 45px 0;
  }

  &__description {
    font-size: 14px;
  }
}
</style>
