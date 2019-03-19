<template>
  <div id="container">
    <v-layout align-center justify-center row>
      <v-flex xs10 md6 lg4>
        <h1 class="display-3 text-capitalize">Send Tokens</h1>
      </v-flex>
    </v-layout>
    <v-layout align-center justify-center row>
      <v-flex xs10 md6 lg4>
        <h3>Token</h3>
        <p>{{ token }}</p>
      </v-flex>
    </v-layout>

    <v-layout align-center justify-center row>
      <v-flex xs10 md6 lg4>
        <h3>Hub</h3>
        <p>{{ partner }}</p>
      </v-flex>
    </v-layout>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class SendTokens extends Vue {
  partner: string = '';
  token: string = '';

  mounted() {
    let route = this.$router.currentRoute;
    let params = route.params;
    if (params.token && params.partner) {
      this.partner = params.partner;
      this.token = params.token;
    }
  }
}
</script>

<style lang="scss" scoped>
#container {
  height: 50vh;
  min-height: 500px;
}
</style>
