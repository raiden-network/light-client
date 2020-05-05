<template>
  <v-container>
    <v-row align="center" justify="center">
      <v-col cols="12">
        <div class="withdrawal__description">
          {{ $t('withdrawal.title') }}
        </div>
      </v-col>
    </v-row>
    <v-row align="center" justify="center">
      <v-col cols="10">
        <v-progress-circular v-if="loading" />
        <v-list class="withdrawal__tokens" flat>
          <template v-for="(token, index) in balances">
            <v-list-item :key="token.address">
              <v-list-item-avatar class="withdrawal__tokens__icon">
                <img
                  :src="$blockie(token.address)"
                  :alt="$t('channel-list.channel.blockie_alt')"
                  class="indenticon"
                />
              </v-list-item-avatar>
              <v-list-item-content>
                <v-list-item-title class="withdrawal__tokens__name">
                  {{ token.name || '' }}
                </v-list-item-title>
                <v-list-item-subtitle class="withdrawal__tokens__address">
                  <address-display :address="token.address" />
                </v-list-item-subtitle>
              </v-list-item-content>
              <v-list-item-icon>
                <amount-display
                  class="withdrawal__tokens__balance"
                  :amount="token.balance"
                  :token="token"
                />
                <v-btn text icon @click="withdraw(token)">
                  <v-img
                    :src="require(`@/assets/withdrawal.svg`)"
                    max-width="24px"
                    height="24px"
                    contain
                  >
                  </v-img>
                </v-btn>
              </v-list-item-icon>
            </v-list-item>
            <v-divider
              v-if="index === balances.length - 1"
              :key="token.address"
            />
          </template>
        </v-list>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { Tokens } from '@/types';
import { Token } from '@/model/types';
import { BigNumber } from 'ethers/utils';
import AddressDisplay from '@/components/AddressDisplay.vue';
import BlockieMixin from '@/mixins/blockie-mixin';
import AmountDisplay from '@/components/AmountDisplay.vue';

@Component({
  components: { AddressDisplay, AmountDisplay },
  computed: {
    ...mapState(['tokens'])
  }
})
export default class Withdrawal extends Mixins(BlockieMixin) {
  tokens!: Tokens;
  balances: Token[] = [];
  loading: boolean = true;

  async mounted() {
    await this.$raiden.fetchTokenList();
    this.balances = (await this.$raiden.getUpdatedBalances(this.tokens)).filter(
      token => token.balance && (token.balance as BigNumber)?.gt(0)
    );
    this.loading = false;
  }

  withdraw(_token: Token) {}
}
</script>

<style scoped lang="scss">
.withdrawal {
  &__description {
    margin-top: 30px;
    text-align: center;
  }

  &__tokens {
    margin-top: 60px;
    background-color: transparent;

    &__balance {
      margin-right: 12px;
    }

    &__address {
      ::v-deep {
        .address__label {
          color: #ffffffb3 !important;
        }
      }
    }
  }
}
</style>
