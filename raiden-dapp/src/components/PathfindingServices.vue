<template>
  <div class="pathfinding-services fill-height">
    <v-row
      no-gutters
      class="pathfinding-services__wrapper"
      align="center"
      justify="center"
    >
      <v-col cols="12">
        <v-row
          v-if="loading"
          align="center"
          justify="center"
          class="pathfinding-services__loading"
        >
          <spinner />
        </v-row>
        <v-row
          v-else-if="error"
          align="center"
          justify="center"
          class="pathfinding-services__error"
        >
          <span>
            {{ error }}
          </span>
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
          <template #item.address="{ item }">
            <v-tooltip bottom>
              <template #activator="{ on }">
                <span v-on="on">
                  {{ item.address | truncate(8) }}
                </span>
              </template>
              <span>{{ item.address }}</span>
            </v-tooltip>
          </template>
          <template #item.host="{ item }">
            <v-tooltip bottom>
              <template #activator="{ on }">
                <span v-on="on">
                  {{ item.url.replace('https://', '') | truncate(28) }}
                </span>
              </template>
              <span>{{ item.url }}</span>
            </v-tooltip>
          </template>
          <template #item.rtt="{ item }">
            {{ $t('pathfinding-services.rtt', { time: item.rtt }) }}
          </template>
          <template #item.price="{ item }">
            <v-tooltip bottom>
              <template #activator="{ on }">
                <span v-on="on">
                  {{ item.price | displayFormat(token(item.token).decimals) }}
                  {{ token(item.token).symbol || '' }}
                </span>
              </template>
              <span>
                {{ item.price | toUnits(token(item.token).decimals) }}
                {{ token(item.token).symbol || '' }}
              </span>
            </v-tooltip>
          </template>
        </v-data-table>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';
import { RaidenPFS } from 'raiden-ts';

import { Token } from '@/model/types';
import Filters from '@/filters';
import Spinner from '@/components/Spinner.vue';

@Component({ components: { Spinner } })
export default class PathfindingServices extends Vue {
  headers: { text: string; align: string; value: string }[] = [];

  error: string = '';
  loading: boolean = false;

  selected: RaidenPFS[] = [];
  services: RaidenPFS[] = [];

  truncate = Filters.truncate;

  mounted() {
    this.headers = [
      {
        text: this.$t('pathfinding-services.headers.host') as string,
        value: 'host',
        align: 'left'
      },
      {
        text: this.$t('pathfinding-services.headers.rtt') as string,
        value: 'rtt',
        align: 'left'
      },
      {
        text: this.$t('pathfinding-services.headers.price') as string,
        value: 'price',
        align: 'left'
      }
    ];
    this.fetchServices();
  }

  @Emit()
  select({
    item,
    value
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
        .map(value => value.token)
        .filter((value, index, array) => array.indexOf(value) === index);

      await this.$raiden.fetchTokenData(tokens);
    } catch (e) {
      this.error = e.message;
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
@import '../scss/colors';

.pathfinding-services {
  &__wrapper > * {
    width: 250px;
    text-align: center;
  }

  &__error {
    height: 86px;
    padding-left: 16px;
    padding-right: 16px;
  }

  &__table {
    margin-bottom: 20px;

    &.v-data-table {
      background-color: transparent !important;
    }

    ::v-deep tr:hover {
      background: $primary-disabled-color !important;
    }

    ::v-deep .v-icon {
      color: $primary-color;
    }

    ::v-deep th {
      font-size: 16px;
      border: none !important;
    }

    ::v-deep td {
      border: none !important;
      padding-top: 5px;
      padding-bottom: 5px;
    }

    ::v-deep .v-data-table__selected,
    ::v-deep tbody tr:hover {
      background: rgba($disabled-text-color, 0.1) !important;
    }
  }
}
</style>
