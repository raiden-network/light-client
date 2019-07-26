<template>
  <v-layout column justify-space-between fill-height>
    <list-header
      :header="$t('tokens.connected.header')"
      class="connected-tokens__header"
    ></list-header>
    <v-layout justify-center row fill-height>
      <v-flex xs12>
        <v-list class="connected-tokens__tokens">
          <v-list-group
            v-for="(token, index) in tokens"
            :id="`token-${index}`"
            :key="token.token"
            class="connected-tokens__tokens__token"
            no-action
          >
            <template #activator>
              <v-list-tile>
                <v-list-tile-avatar class="list-blockie">
                  <img
                    :src="$blockie(token.address)"
                    :alt="$t('tokens.connected.token.blockie-alt')"
                  />
                </v-list-tile-avatar>
                <v-list-tile-content>
                  <v-list-tile-title
                    class="connected-tokens__tokens__token__info"
                  >
                    {{
                      $t('tokens.connected.token.token-info', {
                        symbol: token.symbol,
                        name: token.name
                      })
                    }}
                  </v-list-tile-title>
                  <v-list-tile-sub-title
                    class="connected-tokens__tokens__token__address"
                  >
                    {{ token.address }}
                  </v-list-tile-sub-title>
                </v-list-tile-content>
              </v-list-tile>
            </template>
            <div
              :id="`expanded-area-${index}`"
              class="connected-tokens__tokens__token__expanded"
            >
              <v-layout justify-center row>
                <v-btn
                  :id="`pay-${index}`"
                  :to="`/transfer/${token.address}`"
                  class="text-capitalize connected-tokens__tokens__token__button"
                >
                  {{ $t('tokens.connected.token.buttons.pay') }}
                </v-btn>
                <v-btn
                  :id="`leave-${index}`"
                  @click="leaveNetwork(token)"
                  class="text-capitalize connected-tokens__tokens__token__button leave"
                >
                  {{ $t('tokens.connected.token.buttons.disconnect') }}
                </v-btn>
                <v-btn
                  :to="`/channels/${token.address}`"
                  class="text-capitalize connected-tokens__tokens__token__button"
                >
                  {{ $t('tokens.connected.token.buttons.view-channels') }}
                </v-btn>
              </v-layout>
            </div>
          </v-list-group>
        </v-list>
      </v-flex>
    </v-layout>
    <v-layout align-center justify-center row class="connected-tokens__button">
      <v-flex xs10 class="text-xs-center">
        <v-btn
          to="/connect"
          large
          class="text-capitalize confirm-button"
          depressed
        >
          {{ $t('tokens.connect-new') }}
        </v-btn>
      </v-flex>
    </v-layout>
    <confirmation-dialog
      :display="leaveModalVisible"
      @confirm="leaveConfirmed()"
      @cancel="leaveCancelled()"
    >
      <template #header>
        {{ $t('tokens.disconnect-dialog.header') }}
      </template>
      <div v-if="selectedToken">
        This action will close all channels for the
        <b>{{ selectedToken.symbol }}</b> token!
        <span class="connected-tokens__tokens__token__leave__address">
          {{ selectedToken.address }}
        </span>
      </div>
    </confirmation-dialog>
    <progress-overlay :display="loading" :steps="steps"></progress-overlay>
  </v-layout>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';
import { StepDescription, TokenModel } from '@/model/types';
import ProgressOverlay from '@/components/ProgressOverlay.vue';
import BlockieMixin from '@/mixins/blockie-mixin';
import ListHeader from '@/components/ListHeader.vue';

@Component({
  components: { ListHeader, ProgressOverlay, ConfirmationDialog },
  computed: mapGetters(['tokens'])
})
export default class Tokens extends Mixins(BlockieMixin) {
  tokens!: TokenModel[];
  selectedToken: TokenModel | null = null;
  leaveModalVisible: boolean = false;

  loading: boolean = false;
  steps: StepDescription[] = [
    {
      label: 'Leave',
      title: 'Leaving network',
      description: 'Closing the channels'
    }
  ];

  private dismissModal() {
    this.leaveModalVisible = false;
    this.selectedToken = null;
  }

  leaveNetwork(token: TokenModel) {
    this.selectedToken = token;
    this.leaveModalVisible = true;
  }

  async leaveConfirmed() {
    const address = this.selectedToken!.address;
    this.dismissModal();
    this.loading = true;
    await this.$raiden.leaveNetwork(address);
    this.loading = false;
  }

  leaveCancelled() {
    this.dismissModal();
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/button';

.connected-tokens__header {
  margin-top: 115px;
}

.connected-tokens__tokens {
  background-color: transparent !important;
  padding-bottom: 0;
  padding-top: 0;
}

.connected-tokens__tokens /deep/ .v-avatar {
  padding-left: 30px;
  padding-right: 30px;
}

.connected-tokens__tokens /deep/ .v-list__tile {
  height: 105px;
}

.connected-tokens__tokens /deep/ .v-list__group__header:hover {
  background-color: $token-entry-hover-background;
}

.connected-tokens__tokens__token {
  background-color: $token-entry-background;
  box-shadow: inset 0 -2px 0 0 rgba(0, 0, 0, 0.5);
}

.connected-tokens__tokens__token__info {
  font-weight: bold;
  line-height: 20px;
  font-size: 16px;
}

.connected-tokens__tokens__token__address {
  color: $secondary-text-color !important;
  line-height: 20px;
  font-size: 16px;
}

.connected-tokens__tokens__token__expanded {
  background-color: $expanded-area-background;
  padding: 25px;
}

.connected-tokens__tokens__token__button.leave {
  border: 2px solid $primary-color;
  background-color: transparent !important;
}

.connected-tokens__tokens__token__button {
  width: 180px;
  height: 35px;
  border-radius: 29px;
  margin-right: 10px;
  margin-left: 10px;
  background-color: $primary-color !important;
}

.connected-tokens__button {
  margin-top: 30px;
  margin-bottom: 60px;
}

.connected-tokens__tokens__token__leave__address {
  color: $secondary-text-color;
  font-size: 14px;
}
</style>
