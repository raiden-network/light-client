<template>
  <v-list-item
    :key="detailedToken.address"
    data-cy="token_list_item"
    class="token-list-item"
    @click="emitSelectToken"
  >
    <v-list-item-avatar>
      <img
        :src="avatarSource"
        :src-lazy="require('@/assets/generic.svg')"
        :alt="$t('token-list.item.blockie-alt')"
      />
    </v-list-item-avatar>

    <v-list-item-content class="mr-4">
      <v-list-item-title class="font-weight-bold">
        {{
          $t('token-list.item.information-template', {
            symbol: detailedToken.symbol,
            name: detailedToken.name,
          })
        }}
      </v-list-item-title>
      <v-list-item-subtitle>
        <address-display
          :address="detailedToken.address"
          class="token-list-item__address"
        />
      </v-list-item-subtitle>
    </v-list-item-content>

    <v-list-item-action-text class="mt-n5 mr-5">
      <amount-display
        v-if="detailedToken.balance"
        :amount="detailedToken.balance"
        :token="detailedToken"
        exact-amount
        class="token-list-item__balance white--text font-weight-bold"
      />
    </v-list-item-action-text>
  </v-list-item>
</template>

<script lang="ts">
import { Component, Mixins, Prop, Emit } from 'vue-property-decorator';
import BlockieMixin from '@/mixins/blockie-mixin';
import AddressDisplay from '@/components/AddressDisplay.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import { TokenModel, Token } from '@/model/types';

@Component({ components: { AddressDisplay, AmountDisplay } })
export default class TokenListItem extends Mixins(BlockieMixin) {
  @Prop({ required: true })
  token!: Token | TokenModel;

  get detailedToken(): Token | TokenModel {
    return this.$store.getters.token(this.token.address) ?? this.token;
  }

  get avatarSource(): string {
    return this.$blockie(this.token.address);
  }

  @Emit('select')
  emitSelectToken(): Token {
    return this.token;
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/fonts';

.token-list-item {
  height: 105px;
  box-shadow: inset 0 -3px 0 0 rgba(0, 0, 0, 0.5);

  &__address {
    color: #696969 !important;
  }

  &__balance {
    font-size: 16px;
  }
}
</style>
