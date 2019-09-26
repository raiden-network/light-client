<template>
  <v-layout column justify-space-between fill-height>
    <list-header
      :header="$t('tokens.connected.header')"
      class="connected-tokens__header"
    ></list-header>
    <v-layout justify-center fill-height>
      <v-flex xs12>
        <v-list class="connected-tokens__tokens" expand>
          <v-list-group
            v-for="(token, index) in tokens"
            :key="token.token"
            class="connected-tokens__tokens__token"
            no-action
          >
            <template #activator>
              <v-list-item :id="`token-${index}`">
                <v-list-item-avatar class="list-blockie">
                  <img
                    :src="$blockie(token.address)"
                    :alt="$t('tokens.connected.token.blockie-alt')"
                  />
                </v-list-item-avatar>
                <v-list-item-content>
                  <v-list-item-title
                    class="connected-tokens__tokens__token__info"
                  >
                    {{
                      $t('tokens.connected.token.token-info', {
                        symbol: token.symbol,
                        name: token.name
                      })
                    }}
                  </v-list-item-title>
                  <v-list-item-subtitle
                    class="connected-tokens__tokens__token__address"
                  >
                    {{ token.address }}
                  </v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
            </template>
            <div
              :id="`expanded-area-${index}`"
              class="connected-tokens__tokens__token__expanded"
            >
              <v-layout justify-center>
                <v-btn
                  :disabled="token.open === 0"
                  :id="`pay-${index}`"
                  :to="`/payment/${token.address}`"
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

    <action-button
      @click="navigateToTokenSelect()"
      :text="$t('tokens.connect-new')"
      class="connected-tokens__button"
      enabled
    ></action-button>

    <confirmation-dialog
      :display="leaveModalVisible"
      @confirm="leaveConfirmed()"
      @cancel="leaveCancelled()"
    >
      <template #header>
        {{ $t('tokens.disconnect-dialog.header') }}
      </template>
      <i18n
        v-if="selectedToken"
        path="tokens.disconnect-dialog.confirmation-message"
        tag="div"
      >
        <b place="symbol">{{ selectedToken.symbol }}</b>
        <span
          place="address"
          class="connected-tokens__tokens__token__leave__address"
        >
          {{ selectedToken.address }}
        </span>
      </i18n>
    </confirmation-dialog>
    <stepper :display="loading" :steps="steps" :doneStep="doneStep"></stepper>
  </v-layout>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';
import { emptyDescription, StepDescription, TokenModel } from '@/model/types';
import Stepper from '@/components/Stepper.vue';
import BlockieMixin from '@/mixins/blockie-mixin';
import ListHeader from '@/components/ListHeader.vue';
import ActionButton from '@/components/ActionButton.vue';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({
  components: { ListHeader, Stepper, ConfirmationDialog, ActionButton },
  computed: mapGetters(['tokens'])
})
export default class Tokens extends Mixins(BlockieMixin, NavigationMixin) {
  tokens!: TokenModel[];
  selectedToken: TokenModel | null = null;
  leaveModalVisible: boolean = false;

  loading: boolean = false;
  steps: StepDescription[] = [];
  doneStep: StepDescription = emptyDescription();

  created() {
    this.steps = [(this.$t('tokens.leave-progress') as any) as StepDescription];
    this.doneStep = (this.$t('tokens.leave-done') as any) as StepDescription;
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

<style lang="scss" scoped>
@import '../scss/colors';

.connected-tokens__header {
  margin-top: 115px;
}

.connected-tokens__tokens {
  background-color: transparent !important;
  padding-bottom: 0;
  padding-top: 0;
}

.connected-tokens__tokens ::v-deep .v-avatar {
  padding-left: 30px;
  padding-right: 30px;
}

.connected-tokens__tokens ::v-deep .v-list-item {
  height: 105px;
}

.connected-tokens__tokens ::v-deep .v-list__group__header:hover {
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
