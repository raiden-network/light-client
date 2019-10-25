<template>
  <div class="pathfinding-services fill-height">
    <v-row no-gutters>
      <v-col cols="12">
        <h2>
          {{ $t('pathfinding-services.title') }}
        </h2>
      </v-col>
    </v-row>
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
          <v-progress-circular
            indeterminate
            color="primary"
          ></v-progress-circular>
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
          @click:row="clicked($event)"
          dense
          disable-pagination
          hide-default-footer
          single-select
          sort-by="price"
          item-key="service"
          class="pathfinding-services__table"
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
          <template #item.url="{ item }">
            <v-tooltip bottom>
              <template #activator="{ on }">
                <span v-on="on">
                  {{ item.url | truncate(38) }}
                </span>
              </template>
              <span>{{ item.url }}</span>
            </v-tooltip>
          </template>
          <template #item.rtt="{ item }">
            {{ $t('pathfinding-services.rtt', { time: item.rtt }) }}
          </template>
          <template #item.price="{ item }">
            {{ item.price }}
          </template>
        </v-data-table>
        <v-row
          align="end"
          justify="center"
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
        </v-row>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';
import { RaidenPFS } from 'raiden-ts';

@Component({})
export default class PathfindingServices extends Vue {
  headers: { text: string; align: string; value: string }[] = [];

  error: string = '';
  loading: boolean = false;

  selected: RaidenPFS[] = [];
  services: RaidenPFS[] = [];

  mounted() {
    this.headers = [
      {
        text: this.$t('pathfinding-services.headers.address') as string,
        value: 'address',
        align: 'left'
      },
      {
        text: this.$t('pathfinding-services.headers.url') as string,
        value: 'url',
        align: 'left'
      },
      {
        text: this.$t('pathfinding-services.headers.rtt') as string,
        value: 'rtt',
        align: 'right'
      },
      {
        text: this.$t('pathfinding-services.headers.price') as string,
        value: 'price',
        align: 'right'
      }
    ];
    this.fetchServices();
  }

  async fetchServices() {
    this.loading = true;
    try {
      this.services = await this.$raiden.fetchServices();
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  }

  clicked(selected: RaidenPFS) {
    this.selected = [];
    this.selected.push(selected);
  }

  @Emit()
  cancel() {
    this.loading = false;
    this.error = '';
  }

  @Emit()
  confirm(): RaidenPFS {
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

.pathfinding-services__loading {
  height: 72px;
}

.pathfinding-services__error {
  height: 86px;
  padding-left: 16px;
  padding-right: 16px;
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
