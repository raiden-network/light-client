<template>
  <div class="token-information">
    <span class="token-information__details">
      {{
        $t('token-information.description', {
          symbol: token.symbol,
        })
      }}
      <address-display class="token-information__details__address" :address="token.address" />
    </span>
    <div class="token-information__balance">
      <span class="token-information__balance__amount">
        {{ (token.balance || 0) | displayFormat(token.decimals) }}
      </span>
      <v-tooltip v-if="!mainnet" bottom>
        <template #activator="{ on }">
          <v-btn
            icon
            small
            data-cy="token_information_mint"
            @click="showMintDialog = true"
            v-on="on"
          >
            <img
              :src="require('@/assets/icon-deposit.svg')"
              class="token-information__balance__mint"
            />
          </v-btn>
        </template>
      </v-tooltip>
    </div>
    <mint-dialog
      :token="token"
      :visible="showMintDialog"
      @cancel="showMintDialog = false"
      @done="tokenMinted()"
    />
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import { Token } from '@/model/types';
import AddressDisplay from '@/components/AddressDisplay.vue';
import MintDialog from '@/components/dialogs/MintDialog.vue';

@Component({
  components: { AddressDisplay, MintDialog },
  computed: {
    ...mapGetters(['mainnet']),
  },
})
export default class TokenInformation extends Vue {
  @Prop()
  token!: Token;

  getToken!: (address: string) => Token;
  mainnet!: boolean;
  showMintDialog = false;

  async tokenMinted() {
    this.showMintDialog = false;

    // Update token information
    await this.$raiden.fetchAndUpdateTokenData([this.token.address]);
  }
}
</script>
<style scoped lang="scss">
.token-information {
  align-items: center;
  display: flex;
  height: 100%;
  padding: 0 16px;
  width: 100%;

  &__details {
    display: flex;
    flex: none;

    &__address {
      margin-left: 4px;
    }
  }

  &__balance {
    flex: 1;
    text-align: right;

    &__mint {
      height: 24px;
      padding-bottom: 6px;
    }
  }
}
</style>
