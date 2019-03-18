<template>
  <v-container>
    <NoValidProvider v-if="!providerDetected" />
    <UserDenied v-else-if="userDenied" />
    <WalletCore v-else />
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import WalletCore from '@/components/WalletCore.vue';
import NoValidProvider from '@/components/NoValidProvider.vue';
import UserDenied from '@/components/UserDenied.vue'; // @ is an alias to /src

@Component({
  components: {
    UserDenied,
    WalletCore,
    NoValidProvider
  }
})
export default class Home extends Vue {
  get providerDetected(): boolean {
    return this.$store.state.providerDetected;
  }

  get userDenied(): boolean {
    return this.$store.state.userDenied;
  }

  mounted() {
    if (this.providerDetected && !this.userDenied) {
      this.$router.push({ name: 'connect' });
    }
  }
}
</script>
