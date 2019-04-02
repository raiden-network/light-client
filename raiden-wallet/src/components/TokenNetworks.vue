<template>
  <div>
    <v-btn to="/connect" color="primary">Connect</v-btn>
    <v-list three-line>
      <template v-for="connection in connections">
        <v-list-tile :key="connection.token" class="connection">
          <v-list-tile-content>
            <v-list-tile-title>
              Connection to {{ connection.token }}
            </v-list-tile-title>
            <v-list-tile-sub-title class="text--primary">
              via hub {{ connection.partner }}
            </v-list-tile-sub-title>
            <v-list-tile-sub-title>
              Status: {{ connection.state }}
            </v-list-tile-sub-title>
          </v-list-tile-content>
          <v-list-tile-action>
            <v-btn icon ripple @click="confirmClose(connection)">
              <v-icon color="grey lighten-1">close</v-icon>
            </v-btn>
          </v-list-tile-action>
        </v-list-tile>
      </template>
    </v-list>
    <confirmation-dialog
      :display="displayModal"
      @confirm="deleteConfirmed()"
      @cancel="deleteCancelled()"
    >
      <template v-slot:title>
        Confirm channel close
      </template>
      <div v-if="selectedConnection">
        Are you sure you want to close the channel with hub
        {{ selectedConnection.partner }} for token
        {{ selectedConnection.token }}?
      </div>
    </confirmation-dialog>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import { RaidenChannel } from 'raiden';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';

@Component({
  components: { ConfirmationDialog },
  computed: mapGetters(['connections'])
})
export default class TokenNetworks extends Vue {
  connections!: RaidenChannel[];
  selectedConnection: RaidenChannel | null = null;
  displayModal: boolean = false;

  confirmClose(channel: RaidenChannel) {
    this.selectedConnection = channel;
    this.displayModal = true;
  }

  async deleteConfirmed() {
    this.displayModal = false;
    await this.$raiden.closeChannel(this.selectedConnection!);
  }

  deleteCancelled() {
    this.displayModal = false;
  }
}
</script>

<style lang="scss" scoped></style>
