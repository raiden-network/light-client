<template>
  <v-container>
    <no-valid-provider v-if="!providerDetected" />
    <user-denied v-else-if="userDenied" />
    <wallet-core v-else />
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import WalletCore from '@/components/WalletCore.vue';
import NoValidProvider from '@/components/NoValidProvider.vue';
import UserDenied from '@/components/UserDenied.vue';
import { mapState } from 'vuex';

@Component({
  components: {
    UserDenied,
    WalletCore,
    NoValidProvider
  },
  computed: mapState(['providerDetected', 'userDenied'])
})
export default class Home extends Vue {
  providerDetected!: boolean;
  userDenied!: boolean;

  mounted() {
    if (this.providerDetected && !this.userDenied) {
      this.$router.push({ name: 'connect' });
    }
  }
}
</script>
