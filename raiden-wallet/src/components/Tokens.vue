<template xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
  <div>
    <v-btn to="/connect" color="primary">Connect</v-btn>
    <v-list three-line>
      <template v-for="(token, index) in tokens">
        <v-list-tile :key="token.token" class="connection">
          <v-list-tile-content>
            <v-list-tile-title> Token: {{ token.address }} </v-list-tile-title>
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
    <confirmation-dialog
      :display="closeModal"
      @confirm="leaveConfirmed()"
      @cancel="leaveCancelled()"
    >
      <template v-slot:title>
        Confirm channel close
      </template>
      <div v-if="selectedToken">
        Are you sure you want to close the channel with hub
        {{ selectedToken.partner }} for token {{ selectedToken.token }}?
      </div>
    </confirmation-dialog>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';
import { TokenModel } from '@/model/token';

@Component({
  components: { ConfirmationDialog },
  computed: mapGetters(['tokens'])
})
export default class Tokens extends Vue {
  tokens!: TokenModel[];
  selectedToken: TokenModel | null = null;
  displayModal: boolean = false;

  leaveNetwork(token: TokenModel) {
    this.selectedToken = token;
    this.displayModal = true;
  }

  async leaveConfirmed() {
    this.displayModal = false;
    await this.$raiden.leaveNetwork(this.selectedToken!.address);
  }

  leaveCancelled() {
    this.displayModal = false;
  }
}
</script>

<style lang="scss" scoped></style>
