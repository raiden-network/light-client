<template>
  <v-layout column class="pathfinding-services">
    <v-layout>
      <v-flex xs12>
        <h2>
          {{ $t('pathfinding-services.title') }}
        </h2>
      </v-flex>
    </v-layout>
    <v-layout class="pathfinding-services__wrapper" align-center justify-center>
      <v-flex xs12>
        <v-data-table
          v-model="selected"
          :headers="headers"
          :items="services"
          @click:row="clicked($event)"
          dense
          disable-pagination
          hide-default-footer
          single-select
          sort-by="price"
          item-key="service"
          class="pathfinding-services__table"
        >
          <template #item.service="{ item }">
            <v-tooltip bottom>
              <template #activator="{ on }">
                <span v-on="on">
                  {{ item.service | truncate(8) }}
                </span>
              </template>
              <span>{{ item.service }}</span>
            </v-tooltip>
          </template>
          <template #item.pfs="{ item }">
            {{ item.pfs }}
          </template>
          <template #item.rtt="{ item }">
            {{ $t('pathfinding-services.rtt', { time: item.rtt }) }}
          </template>
          <template #item.price="{ item }">
            {{ item.price }}
          </template>
        </v-data-table>
        <v-layout
          align-end
          justify-center
          class="pathfinding-services__buttons"
        >
          <v-btn
            @click="cancel()"
            light
            class="text-capitalize pathfinding-services__buttons__cancel"
          >
            {{ $t('general.buttons.cancel') }}
          </v-btn>
          <v-btn
            :disabled="selected.length === 0"
            @click="confirm()"
            light
            class="text-capitalize pathfinding-services__buttons__confirm"
          >
            {{ $t('general.buttons.confirm') }}
          </v-btn>
        </v-layout>
      </v-flex>
    </v-layout>
  </v-layout>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';
import { BigNumberish } from 'ethers/utils';

type PathfindingService = {
  service: string;
  pfs: string;
  rtt: number;
  price: BigNumberish;
};
@Component({})
export default class PathfindingServices extends Vue {
  selected: PathfindingService[] = [];
  headers: { text: string; align: string; value: string }[] = [
    {
      text: 'Address',
      value: 'service',
      align: 'left'
    },
    {
      text: 'URL',
      value: 'pfs',
      align: 'left'
    },
    {
      text: 'RTT',
      value: 'rtt',
      align: 'right'
    },
    {
      text: 'Price',
      value: 'price',
      align: 'right'
    }
  ];
  services: PathfindingService[] = [
    {
      service: '0x32bBc8ba52FB6F61C24809FdeDA1baa5E55e55EA',
      pfs: 'https://pfs-goerli.services-test.raiden.network',
      rtt: 5,
      price: 1000
    },
    {
      service: '0x0149F4a522342c26Db77fCF03E872595e6a19250',
      pfs: 'https://pfs-goerli.awesome-services.org',
      rtt: 6,
      price: 1500
    }
  ];

  clicked(selected: PathfindingService) {
    this.selected = [];
    this.selected.push(selected);
  }

  @Emit()
  cancel() {}

  @Emit()
  confirm(): PathfindingService {
    const [service] = this.selected;
    return service;
  }
}
</script>

<style scoped lang="scss">
@import '../scss/colors';
.pathfinding-services {
  padding: 20px;
  background-color: $dialog-background;
  box-shadow: 10px 10px 15px 0 rgba(0, 0, 0, 0.3);
}

.pathfinding-services__wrapper > * {
  width: 250px;
  text-align: center;
}

.pathfinding-services__table {
  margin-bottom: 20px;
}

.pathfinding-services__table.v-data-table {
  background-color: transparent !important;
}

.pathfinding-services__table ::v-deep tr:hover {
  background: $primary-disabled-color !important;
}

.pathfinding-services__table ::v-deep .v-icon {
  color: $primary-color;
}

.pathfinding-services__buttons button {
  height: 35px;
  width: 135px;
  color: white;
  border-radius: 29px;
  margin-left: 15px;
  margin-right: 15px;
}

.pathfinding-services__buttons__cancel {
  background-color: transparent !important;
  border: 2px solid $primary-color;
}

.pathfinding-services__buttons__confirm {
  background-color: $primary-color !important;
  color: #ffffff;
}
</style>
