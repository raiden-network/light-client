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
          <v-switch v-model="useRaidenAccountModel" />
        </v-list-item-action>
      </v-list-item>
    </v-list>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { createNamespacedHelpers } from 'vuex';

const { mapState, mapMutations } = createNamespacedHelpers('userSettings');

@Component({
  computed: { ...mapState(['useRaidenAccount']) },
  methods: { ...mapMutations(['enableRaidenAccount', 'disableRaidenAccount']) },
})
export default class RaidenSettings extends Vue {
  useRaidenAccount!: boolean;
  enableRaidenAccount!: () => void;
  disableRaidenAccount!: () => void;

  get useRaidenAccountModel(): boolean {
    return this.useRaidenAccount;
  }

  set useRaidenAccountModel(value: boolean) {
    value ? this.enableRaidenAccount() : this.disableRaidenAccount();
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
    &__action {
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
