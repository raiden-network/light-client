<template>
  <div class="settings">
    <v-list two-line subheader>
      <v-list-item>
        <v-list-item-content>
          <v-list-item-title>Use Raiden Account</v-list-item-title>
          <v-list-item-subtitle>
            By default the dApp uses a generated Raiden account to sign
            messages. Enable main account to use your Web3 provider account. All
            messages will then have to be signed manually.
          </v-list-item-subtitle>
        </v-list-item-content>
        <v-list-item-action>
          <v-switch v-model="useRaidenAccount" @change="toggleMainAccount" />
        </v-list-item-action>
      </v-list-item>
    </v-list>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class Settings extends Vue {
  useRaidenAccount = true;

  mounted() {
    const raidenDapp = window.localStorage.getItem('raiden_dapp');
    const raidenAccount = raidenDapp
      ? JSON.parse(raidenDapp).raidenAccount
      : true;
    this.useRaidenAccount = raidenAccount;
  }

  toggleMainAccount() {
    window.localStorage.setItem(
      'raiden_dapp',
      JSON.stringify({ raidenAccount: this.useRaidenAccount })
    );
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.settings {
  padding: 20px;
}
::v-deep {
  .v-list {
    background-color: $card-background !important;
  }
  .v-list-item {
    &___action {
      align-self: start !important;
      margin: 12px 0;
    }

    &__subtitle {
      white-space: normal;
      font-size: 12px;
    }
  }
}
</style>
