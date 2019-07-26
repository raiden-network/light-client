<template>
  <v-layout align-start justify-center row class="information--container">
    <v-flex xs2 class="information">
      <div class="information-label">Token</div>
    </v-flex>
    <v-flex xs8>
      <div class="information-description">
        {{ token.symbol }} | {{ token.name }}
      </div>
      <div>
        {{ token.address }}
      </div>
    </v-flex>
  </v-layout>
</template>
<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Token } from '@/model/types';

@Component({})
export default class TokenInformation extends Vue {
  @Prop()
  token!: Token;
}
</script>
<style scoped lang="scss">
@import '../scss/input-screen';

.information--container {
  max-height: 55px;
  padding-top: 5px;
}
</style>
