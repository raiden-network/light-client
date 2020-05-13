<template>
  <div class="account-content">
    <div v-if="!loading && defaultAccount">
      <v-row class="account-content__account-details" no-gutters>
        <v-col cols="12">
          <div class="account-content__account-details--title">
            {{ $t('account-content.account-details') }}
          </div>
        </v-col>
      </v-row>
      <v-row no-gutters>
        <v-col cols="2">
          <span class="account-content__account-details--address">
            {{ $t('account-content.address') }}
          </span>
        </v-col>
        <v-col cols="10">
          <span class="account-content__account-details--address">
            <address-display :address="defaultAccount" full-address />
          </span>
        </v-col>
      </v-row>
      <v-row class="account-content__account-details__eth" no-gutters>
        <v-col cols="2">
          <span class="account-content__account-details__eth--currency">
            {{ $t('account-content.currency') }}
          </span>
        </v-col>
        <v-col cols="10">
          <span class="account-content__account-details__eth--balance">
            {{ balance | decimals }}
          </span>
        </v-col>
      </v-row>
    </div>
    <v-list two-line class="account-content__menu">
      <v-list-item
        v-for="(menuItem, index) in menuItems"
        :key="index"
        class="account-content__menu__list-items"
      >
        <div class="account-content__menu__list-items__icon">
          <v-img
            :src="require(`@/assets/${menuItem.icon}`)"
            max-width="40px"
            height="36px"
            contain
          >
          </v-img>
        </div>
        <v-list-item-content>
          <v-list-item-title>{{ menuItem.title }}</v-list-item-title>
          <v-list-item-subtitle>{{ menuItem.subtitle }}</v-list-item-subtitle>
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
import { mapGetters, mapState } from 'vuex';
import { getLogsFromStore } from '@/utils/logstore';
import NavigationMixin from '@/mixins/navigation-mixin';
import AddressDisplay from '@/components/AddressDisplay.vue';

@Component({
  components: {
    AddressDisplay
  },
  computed: {
    ...mapState(['loading', 'defaultAccount']),
    ...mapGetters(['balance', 'isConnected'])
  }
})
export default class AccountContent extends Mixins(NavigationMixin) {
  menuItems: {}[] = [];
  loading!: boolean;
  defaultAccount!: string;
  balance!: string;
  isConnected!: boolean;

  async mounted() {
    this.menuItems = [
      {
        icon: 'state.svg',
        title: this.$t(
          'account-content.menu-items.backup-state.title'
        ) as string,
        subtitle: this.$t(
          'account-content.menu-items.backup-state.subtitle'
        ) as string,
        route: () => {
          this.navigateToBackupState();
        }
      },
      {
        icon: 'bug.svg',
        title: this.$t(
          'account-content.menu-items.report-bugs.title'
        ) as string,
        subtitle: this.$t(
          'account-content.menu-items.report-bugs.subtitle'
        ) as string,
        route: () => {
          this.downloadLogs();
        }
      }
    ];

    // if sub key is used
    if (this.isConnected) {
      const mainAccount = await this.$raiden.getMainAccount();
      const raidenAccount = await this.$raiden.getAccount();
      if (mainAccount && raidenAccount) {
        const raidenAccount = {
          icon: 'eth.svg',
          title: this.$t(
            'account-content.menu-items.raiden-account.title'
          ) as string,
          subtitle: this.$t(
            'account-content.menu-items.raiden-account.subtitle'
          ) as string,
          route: () => {
            this.navigateToRaidenAccountTransfer();
          }
        };

        const withdrawal = {
          icon: 'withdrawal.svg',
          title: this.$t(
            'account-content.menu-items.withdrawal.title'
          ) as string,
          subtitle: this.$t(
            'account-content.menu-items.withdrawal.subtitle'
          ) as string,
          route: () => {
            this.navigateToWithdrawal();
          }
        };
        this.menuItems.unshift(withdrawal);
        this.menuItems.unshift(raidenAccount);
      }
    }

    // if not connected we display the settings menu item
    // to toggle between sub and main key
    // this check should probably be removed once we get
    // more settings
    if (!this.isConnected) {
      this.menuItems.unshift({
        icon: 'gear.svg',
        title: this.$t('account-content.menu-items.settings.title') as string,
        subtitle: this.$t(
          'account-content.menu-items.settings.subtitle'
        ) as string,
        route: () => {
          this.navigateToSettings();
        }
      });
    }
  }

  /* istanbul ignore next */
  async downloadLogs() {
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
</script>

<style scoped lang="scss">
@import '../../scss/colors';

.account-content {
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
