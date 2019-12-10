<template>
  <v-row class="find-routes" align="center" justify="center" no-gutters>
    <v-col cols="12">
      <h3 class="find-routes__title">{{ domain }}</h3>
      <div class="find-routes__subtitle">{{ subdomain }}</div>

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
            <template #items.hops="{ item }">
              {{ item.hops }}
            </template>
            <template #item.fee="{ item }">
              {{ item.fee | displayFormat(token.decimals) }}
              {{ token.symbol }}
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
import { Route, Token } from '@/model/types';

@Component({ components: { Spinner } })
export default class FindRoutes extends Vue {
  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  routes!: Route[];
  @Prop({ required: true })
  pfsUrl!: string;
  selected: Route[] = [];
  headers: { text: string; align: string; value: string }[] = [];

  get domain(): string {
    const [tld, domain] = this.pfsUrl.split('.').reverse();
    return `${domain}.${tld}`;
  }

  get subdomain(): string {
    const url = this.pfsUrl;
    let start = url.indexOf('://');
    if (start >= 0) {
      start += 3;
    } else {
      start = 0;
    }
    const end = url.indexOf(this.domain) - 1;
    return url.substring(start, end);
  }

  mounted() {
    this.headers = [
      {
        text: this.$t('find-routes.hops') as string,
        align: 'left',
        value: 'hops'
      },
      {
        text: this.$t('find-routes.price') as string,
        align: 'left',
        value: 'fee'
      }
    ];

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
  > * {
    text-align: center;
  }

  &__title {
    font-size: 24px;
    line-height: 28px;
    font-weight: bold;
  }

  &__subtitle {
    margin-top: 5px;
    font-size: 16px;
    line-height: 19px;
    color: #646464;
  }

  &__table {
    margin-bottom: 20px;
    margin-top: 45px;

    &.v-data-table {
      background-color: transparent !important;
    }

    ::v-deep {
      th {
        font-size: 16px;
        border: none !important;
      }

      td {
        border: none !important;
        padding-top: 5px;
        padding-bottom: 5px;
      }

      .v-data-table {
        &__selected {
          background: rgba($disabled-text-color, 0.1) !important;
        }
      }

      tbody {
        tr {
          &:hover {
            background: rgba($disabled-text-color, 0.1) !important;
          }
        }
      }

      .v-icon {
        color: $primary-color;
      }
    }
  }

  &__spinner-wrapper {
    margin: 20px;
  }
}
</style>
