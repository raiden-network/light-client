<template>
  <v-container class="header-content pa-0" fluid>
    <v-row align="center" no-gutters>
      <v-col cols="2">
        <v-btn
          v-if="canNavigateBack"
          data-cy="header-content_back-button"
          height="36px"
          width="36px"
          icon
          @click="navigateBack()"
        >
          <v-img :src="require('@/assets/app-header/back_arrow.svg')" />
        </v-btn>
      </v-col>
      <v-col cols="auto" class="header-content__title">
        <div class="header-content__title__route">
          <span class="header-content__title__route__name">{{ $route.meta.title }}</span>
          <v-btn
            v-if="availableInfoOverlay && !disableInfoButton"
            class="header-content__title__route__info"
            icon
            x-small
          >
            <v-img
              class="header-content__title__route__info__icon"
              :src="require('@/assets/app-header/info.svg')"
              width="10px"
              @click="showInfo()"
            />
          </v-btn>
        </div>
        <span v-if="showNetwork" class="header-content__title__network">{{ network }}</span>
      </v-col>
      <v-col cols="2">
        <slot />
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';

@Component({
  computed: {
    ...mapState(['isConnected']),
    ...mapGetters(['network']),
  },
})
export default class HeaderContent extends Vue {
  network!: string;
  isConnected!: boolean;

  @Prop({ type: Boolean, default: false })
  disableBackButton!: boolean;

  @Prop({ type: Boolean, default: false })
  showNetwork!: boolean;

  @Prop({ type: Boolean, default: false })
  disableInfoButton!: boolean;

  @Emit()
  showInfo(): void {
    // pass
  }

  @Emit()
  navigateBack(): void {
    // pass
  }

  get availableInfoOverlay(): boolean {
    return !!this.$route.meta?.infoOverlay;
  }

  get canNavigateBack(): boolean {
    return !this.disableBackButton && !this.$route.meta?.cannotNavigateBack;
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';
@import '@/scss/mixins';

.header-content {
  margin: 20px 20px;

  @include respond-to(handhelds) {
    margin: 10px 10px;
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

        @include respond-to(handhelds) {
          font-size: 20px;
        }
      }

      &__info {
        align-self: center;
        cursor: pointer;
        margin-left: 10px;

        @include respond-to(handhelds) {
          margin-left: 3px;
        }
      }
    }

    &__network {
      color: $secondary-text-color;
      font-size: 12px;
      font-weight: 500;
      margin-top: -7px;
    }
  }
}
</style>
