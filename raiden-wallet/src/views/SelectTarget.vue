<template>
  <div class="content-host">
    <v-layout align-center justify-center row>
      <v-flex xs10 md10 lg10>
        <div class="screen-title">Select Payment Target</div>
      </v-flex>
    </v-layout>

    <v-layout align-center justify-center row>
      <div class="divider"></div>
    </v-layout>

    <v-layout align-center justify-center row>
      <v-flex xs10 md10 lg10 class="information">
        <div class="information-label text-xs-left">Token</div>
        <div class="information-description text-xs-left">{{ token }}</div>
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
    if (params.token) {
      this.token = params.token;
    }
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/input-screen';
</style>
