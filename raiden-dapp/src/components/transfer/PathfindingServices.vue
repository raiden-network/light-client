<template>
  <div class="pathfinding-services fill-height">
    <v-row
      no-gutters
      class="pathfinding-services__wrapper"
      align="center"
      justify="center"
    >
      <v-col cols="12">
        <v-row v-if="loading">
          <spinner />
        </v-row>
        <v-row
          v-else-if="error"
          align="center"
          justify="center"
          class="pathfinding-services__error"
        >
          <error-message :error="error" />
        </v-row>
        <v-data-table
          v-else
          v-model="selected"
          :headers="headers"
          :items="services"
          dense
          disable-pagination
          hide-default-footer
          single-select
          show-select
          sort-by="price"
          item-key="address"
          class="pathfinding-services__table"
          @item-selected="select($event)"
        >
          <template #item.host="{ item }">
            <v-tooltip bottom>
              <template #activator="{ on }">
                <div class="pathfinding-services__table__pfs">
                  <span v-on="on">
                    {{ item.url.replace('https://', '') | truncate(28) }}
                  </span>
                  <span>
                    {{ $t('pathfinding-services.rtt', { time: item.rtt }) }}
                  </span>
                </div>
              </template>
              <span>{{ item.url }}</span>
            </v-tooltip>
          </template>

          <template #item.price="{ item }">
            <amount-display
              exact-amount
              :amount="item.price"
              :token="token(item.tokem)"
            />
          </template>
        </v-data-table>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';
import { RaidenPFS, RaidenError } from 'raiden-ts';

import { Token } from '@/model/types';
import Filters from '@/filters';
import AmountDisplay from '@/components/AmountDisplay.vue';
import Spinner from '@/components/icons/Spinner.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';

@Component({ components: { AmountDisplay, Spinner, ErrorMessage } })
export default class PathfindingServices extends Vue {
  headers: { text: string; align: string; value: string }[] = [];

  error: Error | RaidenError | null = null;
  loading: boolean = false;

  selected: RaidenPFS[] = [];
  services: RaidenPFS[] = [];

  truncate = Filters.truncate;

  mounted() {
    this.headers = [
      {
        text: this.$t('pathfinding-services.headers.host') as string,
        value: 'host',
        align: 'left',
      },
      {
        text: this.$t('pathfinding-services.headers.price') as string,
        value: 'price',
        align: 'right',
      },
    ];
    this.fetchServices();
  }

  @Emit()
  select({
    item,
    value,
  }: {
    item: RaidenPFS;
    value: boolean;
  }): [RaidenPFS, boolean] | null {
    // A PFS service got selected
    if (value) {
      return [item, this.services.length === 1];
    }

    // A PFS service was unselected
    return null;
  }

  async fetchServices() {
    this.loading = true;
    try {
      this.services = await this.$raiden.fetchServices();
      if (this.services.length > 0) {
        const [preSelectedPfs] = this.services;
        this.selected = [preSelectedPfs];
        this.select({ item: preSelectedPfs, value: true });
      }
      const tokens = this.services
        .map((value) => value.token)
        .filter((value, index, array) => array.indexOf(value) === index);

      await this.$raiden.fetchTokenData(tokens);
    } catch (e) {
      this.error = e;
    } finally {
      this.loading = false;
    }
  }

  token(address: string): Token {
    return this.$store.getters.token(address) || ({ address } as Token);
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';
@import '@/scss/mixins';

.pathfinding-services {
  &__wrapper {
    > * {
      width: 250px;
      text-align: center;
    }
  }

  &__table {
    margin-bottom: 20px;

    &__pfs,
    &__price {
      display: flex;
      flex-direction: column;
      height: 42px;
    }

    &.v-data-table {
      background-color: transparent;
    }

    ::v-deep {
      tr {
        &:hover {
          background: $primary-disabled-color !important;
        }
      }

      .v-icon {
        color: $primary-color;
      }

      th {
        font-size: 16px;
        border: none !important;

        @include respond-to(handhelds) {
          padding: 0;
        }
      }

      td {
        border: none !important;
        height: 74px;
        padding-top: 5px;
        padding-bottom: 5px;

        @include respond-to(handhelds) {
          height: auto;
          padding: 0;
        }
      }

      .v-data-table {
        &__selected {
          background: rgba($disabled-text-color, 0.1) !important;
        }

        &__mobile-row {
          &__header,
          &__cell {
            align-self: flex-start;
          }
        }
      }
    }
  }
}
</style>
