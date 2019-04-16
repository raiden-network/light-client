<template xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
  <div>
    <v-list three-line>
      <template v-for="(token, index) in tokens">
        <v-list-tile :key="token.token" class="connection">
          <v-list-tile-avatar>
            <img :src="blocky(token.address)" alt="Partner address blocky" />
          </v-list-tile-avatar>
          <v-list-tile-content>
            <v-list-tile-title> {{ token.symbol }} </v-list-tile-title>
            <v-list-tile-sub-title class="text--primary">
              {{ token.name }}
            </v-list-tile-sub-title>
            <v-list-tile-sub-title> {{ token.address }} </v-list-tile-sub-title>
          </v-list-tile-content>
          <v-list-tile-action>
            <v-menu bottom left>
              <template v-slot:activator="{ on }">
                <v-btn icon v-on="on" :id="'overflow-' + index">
                  <v-icon>more_vert</v-icon>
                </v-btn>
              </template>

              <v-list>
                <v-list-tile
                  @click="leaveNetwork(token)"
                  :id="'leave-' + index"
                >
                  <v-list-tile-title>Leave Network</v-list-tile-title>
                </v-list-tile>
                <v-list-tile :to="'/channels/' + token.address">
                  <v-list-tile-title>View Channels</v-list-tile-title>
                </v-list-tile>
              </v-list>
            </v-menu>
          </v-list-tile-action>
        </v-list-tile>
      </template>
    </v-list>
    <v-btn to="/connect" color="primary">Connect</v-btn>
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
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';
import { StepDescription, TokenModel } from '@/model/types';
import ProgressOverlay from '@/components/ProgressOverlay.vue';

@Component({
  components: { ProgressOverlay, ConfirmationDialog },
  computed: mapGetters(['tokens'])
})
export default class Tokens extends Vue {
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

  blocky(partner: string) {
    return this.$identicon.getIdenticon(partner);
  }

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

<style lang="scss" scoped></style>
