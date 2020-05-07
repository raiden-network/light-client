<template>
  <div class="settings">
    <v-list two-line subheader>
      <v-list-item>
        <v-list-item-content>
          <v-list-item-title>
            {{ $t('settings.raiden-account.title') }}
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ $t('settings.raiden-account.description') }}
          </v-list-item-subtitle>
        </v-list-item-content>
        <v-list-item-action>
          <v-switch
            v-model="settings.useRaidenAccount"
            @change="toggleMainAccount"
          />
        </v-list-item-action>
      </v-list-item>
    </v-list>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { Settings } from '@/types';

@Component({
  computed: { ...mapState(['settings']) }
})
export default class RaidenSettings extends Vue {
  settings!: Settings;

  toggleMainAccount() {
    this.$store.commit('updateSettings', this.settings);
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.settings {
  padding: 20px;
}
::v-deep {
  .v-list {
    background-color: $card-background !important;
  }
  .v-list-item {
    &___action {
      align-self: start !important;
      margin: 12px 0;
    }

    &__subtitle {
      white-space: normal;
      font-size: 12px;
    }
  }
}
</style>
