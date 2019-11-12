<template>
  <v-row class="find-routes" align="center" justify="center" no-gutters>
    <v-col cols="12">
      <h2 v-if="!busy && error">{{ $t('find-routes.error.title') }}</h2>

      <p v-if="!busy && !error">{{ $t('find-routes.description') }}</p>

      <v-row
        v-if="busy"
        align="center"
        justify="center"
        class="find-routes__spinner-wrapper"
      >
        <v-progress-circular
          :size="110"
          :width="7"
          class="stepper__card__content--progress"
          indeterminate
        ></v-progress-circular>
      </v-row>
      <v-row v-else-if="!busy && error">
        <p>{{ error }}</p>
      </v-row>
      <v-row v-else align="center" justify="center">
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
                <td class="text-right">
                  {{ props.item.displayFee }}
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-form>
      </v-row>
    </v-col>
  </v-row>
</template>

<script lang="ts">
import { BigNumber } from 'ethers/utils';
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

import { BalanceUtils } from '@/utils/balance-utils';
import { Token, Route } from '@/model/types';
import { RaidenPFS } from 'raiden-ts';

@Component({})
export default class FindRoutes extends Vue {
  @Prop({ required: true })
  token!: Token;

  @Prop({ required: true })
  amount!: string;

  @Prop({ required: true })
  target!: string;

  @Prop({ required: true })
  pfs!: RaidenPFS | null;

  busy: boolean = false;
  error: string = '';
  headers: { text: string; align: string; value: string }[] = [];
  selected: Route[] = [];
  routes: Route[] = [];
  convertToUnits = BalanceUtils.toUnits;

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

    this.findRoutes();
  }

  async findRoutes(): Promise<void> {
    const { address, decimals } = this.token;
    this.busy = true;

    try {
      // Fetch available routes from PFS
      const fetchedRoutes = await this.$raiden.findRoutes(
        address,
        this.target,
        BalanceUtils.parse(this.amount, decimals!),
        this.pfs ? this.pfs : undefined
      );

      if (fetchedRoutes) {
        // Convert to displayable Route type
        this.routes = fetchedRoutes.map(
          ({ path, fee }, index: number) =>
            ({
              key: index,
              hops: path.length - 1,
              displayFee: BalanceUtils.toUnits(fee as BigNumber, decimals!),
              fee,
              path
            } as Route)
        );

        // Pre select the cheapest route
        const [route] = this.routes;
        this.selected = [route];
        this.select({ item: route, value: true });
      }
    } catch (e) {
      this.error = e.message;
    }

    this.busy = false;
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

.find-routes > * {
  text-align: center;
}

.find-routes__table {
  margin-bottom: 20px;
}

.find-routes__table.v-data-table {
  background-color: transparent !important;
}

.find-routes__table ::v-deep tr.v-data-table__selected {
  background: transparent !important;
}

.find-routes__table ::v-deep tr:hover {
  background: $primary-disabled-color !important;
}

.find-routes__table ::v-deep .v-icon {
  color: $primary-color;
}

.find-routes__buttons {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.find-routes__spinner-wrapper {
  margin: 20px;
}

.find-routes__buttons button {
  height: 35px;
  width: 135px;
  color: white;
  border-radius: 29px;
  margin-left: 15px;
  margin-right: 15px;
}

.find-routes__buttons__cancel {
  background-color: transparent !important;
  border: 2px solid $primary-color;
}

.find-routes__buttons__confirm {
  background-color: $primary-color !important;
  color: #ffffff;
}

.stepper__card__content--progress {
  color: $secondary-color;
}

.theme--light.v-btn.v-btn--disabled:not(.v-btn--icon):not(.v-btn--text):not(.v-btn--outline) {
  background-color: $primary-disabled-color !important;
  color: #c4c4c4 !important;
}
</style>
