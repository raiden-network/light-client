<template>
  <div class="header-identicon">
    <v-tooltip v-if="pendingTransferAmount" bottom>
      <template #activator="{ on }">
        <v-badge
          color="primary"
          bordered
          :content="pendingTransferAmount"
          overlap
        >
          <v-img
            :src="$blockie(defaultAccount)"
            contain
            aspect-ratio="1"
            class="header-identicon__blockie"
            v-on="on"
          />
        </v-badge>
      </template>
      <span>
        {{
          $tc('app-header.pending-transfers', pendingTransferAmount, {
            amount: pendingTransferAmount,
          })
        }}
      </span>
    </v-tooltip>
    <v-img
      v-else
      :src="$blockie(defaultAccount)"
      contain
      aspect-ratio="1"
      :class="{
        'header-identicon__blockie': defaultAccount,
        'header-identicon__blockie header-identicon__blockie__grayscale': !defaultAccount,
      }"
    />
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';
import BlockieMixin from '@/mixins/blockie-mixin';
import { Transfers } from '@/types';

@Component({
  computed: {
    ...mapState(['defaultAccount']),
    ...mapGetters(['pendingTransfers']),
  },
})
export default class HeaderIdenticon extends Mixins(BlockieMixin) {
  defaultAccount!: string;
  pendingTransfers!: Transfers;

  get pendingTransferAmount(): number {
    return Object.keys(this.pendingTransfers).length;
  }
}
</script>

<style scoped lang="scss">
@import '../main';
@import '../scss/colors';

.header-identicon {
  &__blockie {
    border-radius: 50%;
    box-sizing: border-box;
    height: 36px;
    width: 36px;
    border: 1px solid $color-white;
    background-color: $color-gray;

    &__grayscale {
      filter: grayscale(1);
    }
  }

  ::v-deep {
    .v-badge {
      &__badge {
        &:after {
          border-color: $color-white !important;
          border-width: 1px !important;
        }
      }
    }
  }
}
</style>
