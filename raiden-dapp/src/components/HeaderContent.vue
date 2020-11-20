<template>
  <div class="header-content">
    <div class="header-content__back-button">
      <v-btn
        v-if="canNavigateBack"
        data-cy="header-content_back-button"
        height="40px"
        width="40px"
        icon
        @click="navigateBack()"
      >
        <v-img :src="require('@/assets/app-header/back_arrow.svg')" />
      </v-btn>
    </div>
    <div class="header-content__title">
      <div class="header-content__title__route">
        <span class="header-content__title__route__name">{{ $route.meta.title }}</span>
        <v-btn
          v-if="availableInfoOverlay"
          class="header-content__title__route__info"
          icon
          height="20px"
          width="20px"
        >
          <v-img
            class="header-content__title__route__info__icon"
            :src="require('@/assets/app-header/info.svg')"
            @click="toggleOverlay()"
          />
        </v-btn>
      </div>
      <span v-if="showNetwork" class="header-content__title__network">{{ network }}</span>
    </div>
    <div class="header-content__items">
      <slot></slot>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Emit, Vue, Prop } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import { RouteNames } from '@/router/route-names';

@Component({
  computed: {
    ...mapGetters(['network', 'isConnected']),
  },
})
export default class HeaderContent extends Vue {
  network!: string;
  isConnected!: boolean;

  @Emit()
  toggleOverlay(): boolean {
    return this.showInfoOverlay ? false : true;
  }

  @Emit()
  navigateBack(): void {
    // pass
  }

  @Prop({ type: Boolean, default: false })
  disableBackButton!: boolean;

  @Prop({ type: Boolean, default: false })
  showNetwork!: boolean;

  @Prop({ type: Boolean, default: false })
  showInfoOverlay!: boolean;

  get availableInfoOverlay(): boolean {
    const infoOverlayRoutes: string[] = [
      RouteNames.SELECT_HUB,
      RouteNames.OPEN_CHANNEL,
      RouteNames.TRANSFER,
      RouteNames.TRANSFER_STEPS,
      RouteNames.CHANNELS,
      RouteNames.ACCOUNT_RAIDEN,
      RouteNames.ACCOUNT_WITHDRAWAL,
      RouteNames.ACCOUNT_UDC,
      RouteNames.ACCOUNT_BACKUP,
    ];

    return infoOverlayRoutes.includes(this.$route.name!);
  }

  get canNavigateBack(): boolean {
    const routesWithoutBackBtn: string[] = [
      RouteNames.DISCLAIMER,
      RouteNames.HOME,
      RouteNames.TRANSFER,
    ];

    return (
      this.isConnected &&
      !this.disableBackButton &&
      !this.showInfoOverlay &&
      !routesWithoutBackBtn.includes(this.$route.name!)
    );
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';

.header-content {
  align-items: center;
  display: flex;
  flex: 1;
  justify-content: center;

  &__back-button {
    flex: 1;
    margin-left: 20px;
  }

  &__title {
    align-items: center;
    display: flex;
    flex: 3;
    flex-direction: column;

    &__route {
      display: flex;

      &__name {
        color: $color-white;
        font-size: 24px;
      }

      &__info {
        align-self: center;
        cursor: pointer;
        margin-left: 10px;
      }
    }

    &__network {
      color: $secondary-text-color;
      font-size: 12px;
      font-weight: 500;
    }
  }

  &__items {
    flex: 1;
    margin-right: 20px;
  }
}
</style>
