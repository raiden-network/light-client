<template>
  <div data-cy="account_root" class="account-root">
    <v-row class="account-root__identicon" no-gutters>
      <header-identicon />
    </v-row>
    <account-content />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

import AccountContent from '@/components/account/AccountContent.vue';
import HeaderIdenticon from '@/components/HeaderIdenticon.vue';

@Component({
  components: {
    AccountContent,
    HeaderIdenticon,
  },
})
export default class AccountRoot extends Vue {}
</script>

<style scoped lang="scss">
@import '@/scss/scroll';

.account-root {
  overflow-y: auto;
  @extend .themed-scrollbar;

  &__identicon {
    align-self: center;
    border-bottom: solid 1px #707070;
    justify-content: center;
    margin: 0 64px 0 64px;
    padding-bottom: 30px;
  }

  ::v-deep {
    .header-identicon {
      &__blockie {
        height: 70px;
        width: 70px;
      }
    }
  }
}
</style>
