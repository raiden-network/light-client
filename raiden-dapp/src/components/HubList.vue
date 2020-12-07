<template>
  <div class="hub-list">
    <span class="hub-list__header">{{ $t('hub-list.header') }}</span>
    <spinner v-if="loadingHubs" class="hub-list__loading" />
    <div v-else-if="!loadingHubs && !suggestedHubs" class="hub-list__no-hubs">
      {{ $t('hub-list.error') }}
    </div>
    <div v-for="(suggestedHub, index) in suggestedHubs.slice(0, 3)" v-else :key="index">
      <div class="hub-list__item">
        <div class="hub-list__item__icon">
          <v-img :src="require('@/assets/hub-list/hub-healthy.svg')" />
        </div>
        <span class="hub-list__item__address">{{ suggestedHub.address }}</span>
        <span class="hub-list__item__address-mobile">
          {{ truncate(suggestedHub.address, 10) }}
        </span>
        <v-btn text class="hub-list__item__select-button" @click="selectDeselectHub(index)">
          <div
            v-if="hubIsSelected(suggestedHub.address)"
            class="hub-list__item__select-button__selected-icon"
          >
            <v-img :src="require('@/assets/hub-list/hub-selected.svg')" />
          </div>
          <span v-else>
            {{ $t('hub-list.select-button') }}
          </span>
        </v-btn>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Emit, Prop } from 'vue-property-decorator';
import Spinner from '@/components/icons/Spinner.vue';
import Filters from '@/filters';
import { SuggestedPartner } from 'raiden-ts/src/services/types';

@Component({
  components: {
    Spinner,
  },
})
export default class HubList extends Vue {
  truncate = Filters.truncate;
  loadingHubs = true;
  suggestedHubs: SuggestedPartner[] = [];
  selectedHub = '';

  @Prop({ required: true })
  tokenAddress!: string;

  @Emit()
  selectHub(): string {
    return this.selectedHub;
  }

  async mounted() {
    try {
      this.suggestedHubs = await this.$raiden.getSuggestedPartners(this.tokenAddress);
      this.loadingHubs = false;
    } catch (err) {
      this.loadingHubs = false;
    }
  }

  selectDeselectHub(hubIndex: number): void {
    const clickedHub = this.suggestedHubs[hubIndex].address;

    if (this.selectedHub === clickedHub) {
      this.selectedHub = '';
    } else {
      this.selectedHub = clickedHub;
    }

    this.selectHub();
  }

  hubIsSelected(address: string): boolean {
    return this.selectedHub === address ? true : false;
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';
@import '@/scss/mixins';

.hub-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: 0 16px;
  @include respond-to(handhelds) {
    overflow-y: auto;
  }

  &__header {
    color: $color-gray;
    flex: none;
    font-weight: 500;
    margin: 16px 0;
  }

  &__no-hubs,
  &__item {
    align-items: center;
    background-color: #272728;
    border-radius: 8px;
    display: flex;
    height: 48px;
  }

  &__loading {
    flex: 1;
  }

  &__no-hubs {
    color: $color-gray;
    justify-content: center;
  }

  &__item {
    margin-bottom: 8px;

    &__icon {
      height: 28px;
      margin: 7px 10px 0 10px;
      width: auto;
    }

    &__address,
    &__address-mobile,
    &__select-button {
      color: #44ddff;
      font-size: 16px;
    }

    &__address {
      flex: 1;
      @include respond-to(handhelds) {
        display: none;
      }
    }

    &__address-mobile {
      display: none;
      @include respond-to(handhelds) {
        display: inline;
        flex: 1;
      }
    }

    &__select-button {
      background-color: #182d32;
      border-radius: 8px;
      font-size: 12px;
      margin-right: 10px;
      width: 56px;

      &__selected-icon {
        align-items: center;
        display: flex;
        height: auto;
        width: 20px;
      }
    }
  }
}
</style>
