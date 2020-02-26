<template>
  <div v-if="!loading && defaultAccount" class="app-header">
    <v-row class="app-header__top" justify="center" align="center" no-gutters>
      <v-col cols="12">
        <div class="app-header__top__content">
          <div class="app-header__top__content__back">
            <v-btn
              v-if="canGoBack"
              height="40px"
              width="40px"
              text
              icon
              @click="onBackClicked()"
            >
              <v-img
                :src="require('../assets/back_arrow.svg')"
                max-width="34px"
              ></v-img>
            </v-btn>
          </div>
          <v-spacer></v-spacer>
          <v-col align-self="center">
            <div class="app-header__top__content__title">
              {{ $route.meta.title }}
            </div>
            <div class="app-header__top__content__network">{{ network }}</div>
          </v-col>
          <v-spacer></v-spacer>
          <header-identicon />
        </div>
      </v-col>
    </v-row>
    <v-row class="app-header__bottom" align="center" no-gutters>
      <v-col cols="6">
        <div class="app-header__bottom__address text-left">
          <address-display :address="defaultAccount" />
        </div>
      </v-col>
      <v-col cols="6">
        <div class="app-header__bottom__balance text-right">
          {{ accountBalance | decimals }}
          <span class="app-header__bottom__balance__currency">
            {{ $t('app-header.currency') }}
          </span>
        </div>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';
import BlockieMixin from '@/mixins/blockie-mixin';
import { RouteNames } from '@/router/route-names';
import NavigationMixin from '@/mixins/navigation-mixin';
import HeaderIdenticon from '@/components/HeaderIdenticon.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';

@Component({
  components: { HeaderIdenticon, AddressDisplay },
  computed: {
    ...mapState(['loading', 'defaultAccount', 'accountBalance']),
    ...mapGetters(['network'])
  }
})
export default class AppHeader extends Mixins(BlockieMixin, NavigationMixin) {
  defaultAccount!: string;
  loading!: boolean;
  accountBalance!: string;
  network!: string;

  get canGoBack(): boolean {
    const routesWithoutBackBtn: string[] = [
      RouteNames.HOME,
      RouteNames.TRANSFER
    ];
    return !routesWithoutBackBtn.includes(this.$route.name!);
  }
}
</script>

<style scoped lang="scss">
@import '../scss/mixins';
@import '../scss/colors';

$row-horizontal-padding: 20px;
$header-content-horizontal-margin: 20px;

.app-header {
  &__top {
    height: 80px;
    width: 620px;
    border-radius: 10px 10px 0 0;
    background-color: $card-background;
    box-shadow: 5px 5px 15px 0 rgba(0, 0, 0, 0.3);
    @include respond-to(handhelds) {
      width: 100%;
      border-radius: 0;
    }

    &__content {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: $header-content-horizontal-margin;
      margin-left: $header-content-horizontal-margin;

      &__back {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: 36px;
        height: 36px;
      }

      &__title {
        color: #ffffff;
        font-family: Roboto, sans-serif;
        font-size: 24px;
        line-height: 28px;
        text-align: center;
      }

      &__network {
        font-size: 12px;
        font-weight: 500;
        text-align: center;
        color: $secondary-text-color;
      }
    }
  }

  &__bottom {
    padding-left: $row-horizontal-padding;
    padding-right: $row-horizontal-padding;
    height: 40px;
    background-color: $error-tooltip-background;

    &__balance {
      color: #ffffff;
      font-family: Roboto, sans-serif;
      font-size: 16px;
      line-height: 19px;
    }
  }
}
</style>
