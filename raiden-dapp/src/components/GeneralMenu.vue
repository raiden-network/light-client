<template>
  <div class="general-screen-menu">
    <div v-if="!loading && defaultAccount">
      <v-row class="general-screen-menu__account-details" no-gutters>
        <v-col cols="12">
          <div class="general-screen-menu__account-details--title">
            {{ $t('general-menu.account-details') }}
          </div>
        </v-col>
      </v-row>
      <v-row no-gutters>
        <v-col cols="2">
          <span class="general-screen-menu__account-details--address">
            {{ $t('general-menu.address') }}
          </span>
        </v-col>
        <v-col cols="10">
          <span class="general-screen-menu__account-details--address">
            <address-display :address="defaultAccount" full-address />
          </span>
        </v-col>
      </v-row>
      <v-row class="general-screen-menu__account-details__eth" no-gutters>
        <v-col cols="2">
          <span class="general-screen-menu__account-details__eth--currency">
            {{ $t('general-menu.currency') }}
          </span>
        </v-col>
        <v-col cols="10">
          <span class="general-screen-menu__account-details__eth--balance">
            {{ accountBalance | decimals }}
          </span>
        </v-col>
      </v-row>
    </div>
    <v-list two-line class="general-screen-menu__menu">
      <v-list-item
        v-for="(menuItem, index) in menuItems"
        :key="index"
        class="general-screen-menu__menu__list-items"
      >
        <div class="general-screen-menu__menu__list-items__icon">
          <v-img :src="require(`../assets/${menuItem.icon}`)"></v-img>
        </div>
        <v-list-item-content>
          <v-list-item-title>
            {{ menuItem.title }}
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ menuItem.subtitle }}
          </v-list-item-subtitle>
        </v-list-item-content>
        <v-list-item-action>
          <v-btn icon @click="menuItem.route">
            <v-icon>mdi-chevron-right mdi-36px</v-icon>
          </v-btn>
        </v-list-item-action>
      </v-list-item>
    </v-list>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { getLogsFromStore } from '@/utils/logstore';
import NavigationMixin from '@/mixins/navigation-mixin';
import AddressDisplay from '@/components/AddressDisplay.vue';

@Component({
  components: {
    AddressDisplay
  },
  computed: {
    ...mapState(['loading', 'defaultAccount', 'accountBalance'])
  }
})
export default class GeneralMenu extends Mixins(NavigationMixin) {
  menuItems: {}[] = [];

  mounted() {
    this.menuItems = [
      {
        icon: 'state.svg',
        title: this.$t('general-menu.menu-items.backup-state-title') as string,
        subtitle: this.$t(
          'general-menu.menu-items.backup-state-subtitle'
        ) as string,
        route: () => {
          this.navigateToBackupState();
        }
      },
      {
        icon: 'bug.svg',
        title: this.$t('general-menu.menu-items.report-bugs-title') as string,
        subtitle: this.$t(
          'general-menu.menu-items.report-bugs-subtitle'
        ) as string,
        route: async () => {
          /* istanbul ignore next */
          const [lastTime, content] = await getLogsFromStore();
          const filename = `raiden_${new Date(lastTime).toISOString()}.log`;
          const file = new File([content], filename, { type: 'text/plain' });
          const url = URL.createObjectURL(file);
          const el = document.createElement('a');
          el.href = url;
          el.download = filename;
          el.style.display = 'none';
          document.body.appendChild(el);
          el.click();
          setTimeout(() => {
            URL.revokeObjectURL(url);
            document.body.removeChild(el);
          }, 0);
        }
      }
    ];
  }
}
</script>

<style scoped lang="scss">
@import '../scss/colors';

.general-screen-menu {
  margin: 0 64px 0 64px;

  &__account-details {
    margin-top: 30px;

    &__title {
      font-size: 16px;
      font-weight: 500;
      padding-bottom: 15px;
    }

    &__address {
      font-size: 16px;
    }

    &__eth {
      margin-bottom: 66px;

      &__currency,
      &__balance {
        color: rgba($color-white, 0.7);
        font-size: 14px;
      }
    }
  }

  &__menu {
    background-color: transparent;
    margin-top: 30px;

    &__list-items {
      border: solid 2px $secondary-text-color;
      border-radius: 15px;
      margin-top: -2px;
      height: 74px;

      &__icon {
        padding-right: 20px;
        width: 60px;
      }
    }
  }
}
</style>
