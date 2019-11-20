<template>
  <v-row class="find-routes" align="center" justify="center" no-gutters>
    <v-col cols="12">
      <p>{{ $t('find-routes.description') }}</p>

      <v-row align="center" justify="center">
        <v-form>
          <v-data-table
            v-model="selected"
            :headers="headers"
            :items="routes"
            dense
            disable-pagination
            hide-default-footer
            show-select
            single-select
            sort-by="fee"
            item-key="key"
            class="find-routes__table"
            @item-selected="select($event)"
          >
            <template #items="props">
              <tr
                :active="props.selected"
                @click="props.selected = !props.selected"
              >
                <td>
                  <v-checkbox v-model="props.selected" primary></v-checkbox>
                </td>
                <td class="text-right">{{ props.item.hops }}</td>
                <td class="text-right">{{ props.item.displayFee }}</td>
              </tr>
            </template>
          </v-data-table>
        </v-form>
      </v-row>
    </v-col>
  </v-row>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

import Spinner from '@/components/Spinner.vue';
import { Token, Route } from '@/model/types';

@Component({ components: { Spinner } })
export default class FindRoutes extends Vue {
  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  routes!: Route[];
  headers: { text: string; align: string; value: string }[] = [];
  selected: Route[] = [];

  mounted() {
    this.headers = [
      {
        text: this.$t('find-routes.hops') as string,
        align: 'left',
        value: 'hops'
      },
      {
        text: this.$t('find-routes.fees-in', {
          token: this.token.symbol
        }) as string,
        align: 'right',
        value: 'displayFee'
      }
    ];

    this.selectRoute();
  }

  async selectRoute(): Promise<void> {
    // Pre select the cheapest route
    const [route] = this.routes;
    this.selected = [route];
    this.select({ item: route, value: true });
  }

  @Emit()
  select({ item, value }: { item: Route; value: boolean }): Route | null {
    // A route got selected
    if (value) {
      return item;
    }

    // A route was unselected
    return null;
  }
}
</script>

<style scoped lang="scss">
@import '../scss/colors';

.find-routes {
  & > * {
    text-align: center;
  }

  &__table {
    margin-bottom: 20px;

    &.v-data-table {
      background-color: transparent !important;
    }

    ::v-deep tr.v-data-table__selected {
      background: transparent !important;
    }
    ::v-deep tr:hover {
      background: $primary-disabled-color !important;
    }
    ::v-deep tr th {
      border: none !important;
    }
    ::v-deep tr td {
      text-align: left !important;
    }
    ::v-deep .v-icon {
      color: $primary-color;
    }
  }

  &__spinner-wrapper {
    margin: 20px;
  }
}
</style>
