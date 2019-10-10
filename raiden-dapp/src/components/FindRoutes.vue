<template>
  <v-layout column class="find-routes">
    <v-layout class="find-routes__wrapper" align-center justify-center>
      <v-flex xs12>
        <h2 v-if="busy">{{ $t('find-routes.busy-title') }}</h2>
        <h2 v-else>{{ $t('find-routes.title') }}</h2>

        <p v-if="!busy">{{ $t('find-routes.description') }}</p>

        <v-layout
          v-if="busy"
          align-center
          justify-center
          class="find-routes__spinner-wrapper"
        >
          <v-progress-circular
            :size="110"
            :width="7"
            class="stepper__card__content--progress"
            indeterminate
          ></v-progress-circular>
        </v-layout>
        <v-layout v-else align-center justify-center>
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
            >
              <template v-slot:items="props">
                <tr
                  :active="props.selected"
                  @click="props.selected = !props.selected"
                >
                  <td>
                    <v-checkbox v-model="props.selected" primary></v-checkbox>
                  </td>
                  <td class="text-right">{{ props.item.hops }}</td>
                  <td class="text-right">{{ props.item.fee }}</td>
                </tr>
              </template>
            </v-data-table>
            <p>
              {{
                $t('find-routes.total-amount', {
                  totalAmount: convertToUnits(totalAmount, token.decimals),
                  token: token.symbol
                })
              }}
            </p>
            <v-layout align-end justify-center class="find-routes__buttons">
              <v-btn
                @click="cancel()"
                light
                class="text-capitalize find-routes__buttons__cancel"
                >{{ $t('general.buttons.cancel') }}</v-btn
              >
              <v-btn
                :disabled="selected.length === 0"
                @click="confirm()"
                light
                class="text-capitalize find-routes__buttons__confirm"
                >{{ $t('general.buttons.pay') }}</v-btn
              >
            </v-layout>
          </v-form>
        </v-layout>
      </v-flex>
    </v-layout>
  </v-layout>
</template>

<script lang="ts">
import { BigNumber } from 'ethers/utils';

import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { BalanceUtils } from '@/utils/balance-utils';
import { Token } from '@/model/types';

@Component({})
export default class FindRoutes extends Vue {
  @Prop({ required: true })
  token!: Token;

  @Prop({ required: true })
  amount!: string;

  @Prop({ required: true })
  target!: string;

  busy: boolean = false;
  error: string = '';
  headers: { text: string; align: string; value: string }[] = [];
  selected: { key: number }[] = [];
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
        value: 'fee'
      }
    ];
  }

  get totalAmount(): BigNumber {
    const [selected] = this.selected;
    const { decimals } = this.token;
    const payment: BigNumber = BalanceUtils.parse(this.amount, decimals!);

    if (this.routes.length && selected) {
      const selectedRoute = this.routes.find(
        route => route.key === selected.key
      );

      const fees: BigNumber = BalanceUtils.parse(selectedRoute!.fee, decimals!);
      // Return payable amount plus fees
      return payment.add(fees);
    }

    return payment;
  }

  get routes(): { key: number; hops: number; fee: string }[] {
    const { address, decimals } = this.token;
    this.busy = true;

    try {
      const fee = BalanceUtils.toUnits(
        new BigNumber(0.23423 * 10 ** 10),
        this.token.decimals!
      );
      const fee2 = BalanceUtils.toUnits(
        new BigNumber(0.34123 * 10 ** 10),
        this.token.decimals!
      );
      this.busy = false;

      return [
        {
          key: 0,
          hops: 0,
          fee: fee2
        },
        { key: 1, hops: 3, fee: fee }
      ];
      /*
      // Fetch available routes from PFS
      this.routes = await this.$raiden.findRoutes(
        address,
        this.target,
        BalanceUtils.parse(this.amount, decimals!)
      );
      */

      // Sort routes by cheapest fees
      // Pre select the cheapest route
    } catch (e) {
      this.error = e.message;
    }

    return [];
  }

  @Emit()
  cancel() {
    this.busy = false;
  }

  @Emit()
  confirm() {
    const [selectedRoute] = this.selected;
    return this.routes.filter(route => route.key === selectedRoute.key);
  }
}
</script>

<style scoped lang="scss">
@import '../scss/colors';
.find-routes {
  padding: 20px;
  background-color: $dialog-background;
  box-shadow: 10px 10px 15px 0 rgba(0, 0, 0, 0.3);
}

.find-routes__wrapper > * {
  width: 250px;
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
