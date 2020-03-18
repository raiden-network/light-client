<template>
  <div class="general-screen-menu">
    <v-row class="general-screen-menu__account-details" no-gutters>
      <v-col cols="12">
        <div class="general-screen-menu__account-details--title">
          {{ $t('general-menu.account-details') }}
        </div>
      </v-col>
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
      <v-col cols="2">
        <div class="general-screen-menu__account-details--eth">
          {{ $t('general-menu.currency') }}
        </div>
      </v-col>
      <v-col cols="10">
        <div class="general-screen-menu__account-details--eth">
          {{ accountBalance | decimals }}
        </div>
      </v-col>
    </v-row>
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
import NavigationMixin from '@/mixins/navigation-mixin';
import AddressDisplay from '@/components/AddressDisplay.vue';

@Component({
  components: {
    AddressDisplay
  },
  computed: {
    ...mapState(['defaultAccount', 'accountBalance'])
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
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
    }
  }

  &__menu {
    background-color: transparent;
    margin-top: 96px;

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
