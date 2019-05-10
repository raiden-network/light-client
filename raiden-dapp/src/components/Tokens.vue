<template xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
  <div class="content-host">
    <v-layout justify-center row class="list-container">
      <v-flex xs12 md12 lg12>
        <v-list class="token-list">
          <v-list-group
            v-for="(token, index) in tokens"
            :id="'token-' + index"
            :key="token.token"
            class="token"
            no-action
          >
            <template v-slot:activator>
              <v-list-tile>
                <v-list-tile-avatar class="list-blockie">
                  <img
                    :src="$blockie(token.address)"
                    alt="Partner address blocky"
                  />
                </v-list-tile-avatar>
                <v-list-tile-content>
                  <v-list-tile-title class="token-info">
                    {{ token.symbol }} | {{ token.name }}
                  </v-list-tile-title>
                  <v-list-tile-sub-title class="token-address">
                    {{ token.address }}
                  </v-list-tile-sub-title>
                </v-list-tile-content>
              </v-list-tile>
            </template>
            <div :id="'expanded-area-' + index" class="expanded-area">
              <v-layout justify-center row>
                <v-btn
                  :id="'leave-' + index"
                  class="text-capitalize action-button leave"
                  @click="leaveNetwork(token)"
                  >Leave Network</v-btn
                >
                <v-btn
                  class="text-capitalize action-button"
                  :to="'/channels/' + token.address"
                  >View Channels</v-btn
                >
              </v-layout>
            </div>
          </v-list-group>
        </v-list>
      </v-flex>
    </v-layout>

    <v-layout align-center justify-center class="section">
      <v-flex xs10 md10 lg10 class="text-xs-center">
        <v-btn
          to="/connect"
          large
          class="text-capitalize confirm-button"
          depressed
          >Connect</v-btn
        >
      </v-flex>
    </v-layout>
    <confirmation-dialog
      :display="leaveModalVisible"
      @confirm="leaveConfirmed()"
      @cancel="leaveCancelled()"
    >
      <template v-slot:title>
        Confirm channel close
      </template>
      <div v-if="selectedToken">
        Are you sure you want to close all your channels for token
        {{ selectedToken.address }}?
      </div>
    </confirmation-dialog>
    <progress-overlay :display="loading" :steps="steps"></progress-overlay>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';
import { StepDescription, TokenModel } from '@/model/types';
import ProgressOverlay from '@/components/ProgressOverlay.vue';
import BlockieMixin from '@/mixins/blockie-mixin';

@Component({
  components: { ProgressOverlay, ConfirmationDialog },
  computed: mapGetters(['tokens'])
})
export default class Tokens extends Mixins(BlockieMixin) {
  tokens!: TokenModel[];
  selectedToken: TokenModel | null = null;
  leaveModalVisible: boolean = false;

  loading: boolean = false;
  steps: StepDescription[] = [
    {
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
@import '../main';
@import '../scss/button';

.token {
  background-color: #141414;
  box-shadow: inset 0 -2px 0 0 rgba(0, 0, 0, 0.5);
}

.token-list {
  margin-top: 105px;
  background-color: transparent !important;
}

.token-list /deep/ .v-avatar {
  padding-left: 30px;
  padding-right: 30px;
}

.token-list /deep/ .v-list__tile {
  height: 105px;
}

.token-info {
  font-weight: bold;
  line-height: 20px;
  font-size: 16px;
}

.token-address {
  color: #696969 !important;
  line-height: 20px;
  font-size: 16px;
}

.expanded-area {
  background-color: #323232;
  padding: 25px;
}

.action-button.leave {
  border: 2px solid #050505;
  background-color: transparent !important;
}

.action-button {
  border-radius: 29px;
  margin-right: 25px;
  margin-left: 25px;
}
</style>
