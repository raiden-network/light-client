<template>
  <div data-cy="token_list" class="token-list d-flex flex-column">
    <list-header v-if="header" :header="header" class="flex-grow-0" />

    <div class="token-list__wrapper flex-grow-1">
      <v-virtual-scroll #default="{ item }" :items="tokens" item-height="105" bench="400">
        <token-list-item :token="item" @select="forwardTokenSelection" />
      </v-virtual-scroll>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

import ListHeader from '@/components/ListHeader.vue';
import type { Token } from '@/model/types';

import TokenListItem from './TokenListItem.vue';

@Component({ components: { ListHeader, TokenListItem } })
export default class TokenList extends Vue {
  @Prop({ type: String })
  header!: string;

  @Prop({ required: true })
  tokens!: Token[];

  @Emit('select')
  forwardTokenSelection(token: Token): Token {
    return token;
  }

  async mounted() {
    await this.$raiden.fetchAndUpdateTokenData();
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/scroll';

.token-list {
  height: 100%;

  &__wrapper {
    overflow-y: auto;
    @extend .themed-scrollbar;
  }
}
</style>
