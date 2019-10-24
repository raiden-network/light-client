<template>
  <v-layout v-if="!loading && defaultAccount" class="app-header" column>
    <v-layout class="app-header__top" justify-center align-center>
      <v-flex xs12>
        <div class="app-header__top__content">
          <div class="app-header__top__content__back">
            <v-btn
              v-if="canGoBack"
              @click="onBackClicked()"
              height="40px"
              width="40px"
              text
              icon
            >
              <v-img
                :src="require('../assets/back_arrow.svg')"
                max-width="34px"
              ></v-img>
            </v-btn>
          </div>
          <v-spacer></v-spacer>
          <v-layout column align-center justify-center>
            <div class="app-header__top__content__title">
              {{ $route.meta.title }}
            </div>
            <div class="app-header__top__content__network">
              {{ network }}
            </div>
          </v-layout>
          <v-spacer></v-spacer>
          <div>
            <v-img
              :src="$blockie(defaultAccount)"
              height="36"
              width="36"
              contain
              aspect-ratio="1"
              class="app-header__top__content__blockie"
            ></v-img>
          </div>
        </div>
      </v-flex>
    </v-layout>
    <v-layout class="app-header__bottom" align-center>
      <v-flex xs6>
        <div class="app-header__bottom__address text-left">
          <v-tooltip bottom>
            <template #activator="{ on }">
              <span v-on="on">
                {{ defaultAccount | truncate(8) }}
              </span>
            </template>
            <span>{{ defaultAccount }}</span>
          </v-tooltip>
          <v-tooltip bottom dark close-delay="1500">
            <template #activator="{ on }">
              <v-btn id="copyBtn" @click="copy()" v-on="on" text icon>
                <v-img
                  :src="require('../assets/copy_icon.svg')"
                  class="app-header__bottom__address__copy"
                  contain
                ></v-img>
              </v-btn>
            </template>
            <span>
              {{
                copied ? $t('app-header.copy-success') : $t('app-header.copy')
              }}
            </span>
          </v-tooltip>
        </div>
      </v-flex>
      <v-flex xs6>
        <div class="app-header__bottom__balance text-right">
          {{ accountBalance | decimals }}
          <span class="app-header__bottom__balance__currency">
            {{ $t('app-header.currency') }}
          </span>
        </div>
      </v-flex>
    </v-layout>
    <textarea
      ref="copy"
      v-model="defaultAccount"
      class="app-header__copy-area"
    ></textarea>
  </v-layout>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';
import BlockieMixin from '@/mixins/blockie-mixin';
import { RouteNames } from '@/route-names';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({
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

  copied: boolean = false;
  private timeout: number = 0;

  get canGoBack(): boolean {
    return this.$route.name !== RouteNames.HOME;
  }

  copy() {
    const copyArea = this.$refs.copy as HTMLTextAreaElement;
    copyArea.focus();
    copyArea.select();
    this.copied = document.execCommand('copy');

    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    this.timeout = (setTimeout(() => {
      this.copied = false;
    }, 2000) as unknown) as number;
  }
}
</script>

<style scoped lang="scss">
@import '../main';
@import '../scss/colors';

.app-header__top__content__blockie {
  border-radius: 50%;
  box-sizing: border-box;
  height: 36px;
  width: 36px;
  border: 1px solid #979797;
  background-color: #d8d8d8;
}

.app-header__top__content__back {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 36px;
  height: 36px;
}

.app-header__top__content__title {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 24px;
  line-height: 28px;
  text-align: center;
}

.app-header__bottom__address {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 19px;
  display: flex;
  align-items: center;
}

.app-header__bottom__balance {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 19px;
}

.app-header__top {
  height: 80px;
  width: 620px;
  border-radius: 10px 10px 0 0;
  background-color: $card-background;
  box-shadow: 5px 5px 15px 0 rgba(0, 0, 0, 0.3);
  @include respond-to(handhelds) {
    width: 100%;
    border-radius: 0;
  }
}

.app-header__top__content__network {
  font-size: 12px;
  font-weight: 500;
  color: $secondary-text-color;
}

$row-horizontal-padding: 20px;
.app-header__bottom {
  padding-left: $row-horizontal-padding;
  padding-right: $row-horizontal-padding;
  height: 40px;
  background-color: $error-tooltip-background;
}

.app-header__bottom__address__copy {
  height: 12px;
  width: 12px;
}

$header-content-horizontal-margin: 20px;
.app-header__top__content {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: $header-content-horizontal-margin;
  margin-left: $header-content-horizontal-margin;
}

.app-header__copy-area {
  position: absolute;
  left: -999em;
}
</style>
