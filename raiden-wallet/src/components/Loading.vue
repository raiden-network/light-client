<template>
  <v-container class="full-screen">
    <v-layout align-center row justify-center>
      <v-flex md8 xs8>
        <div class="img-container">
          <v-img aspect-ratio="1" :src="require('../assets/logo.svg')" />
        </div>
      </v-flex>
    </v-layout>
    <v-layout align-center justify-center row>
      <v-flex md8 xs8 class="display-3">Raiden Wallet</v-flex>
    </v-layout>
    <v-layout align-center justify-center row>
      <v-flex md8 xs8 class="display-1 font-weight-light">
        Loading
        <span class="d">.</span>
        <span class="d d-2">.</span>
        <span class="d d-3">.</span>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class Loading extends Vue {}
</script>

<style lang="scss" scoped>
@keyframes dots {
  50% {
    transform: translateY(-0.4rem);
  }
  100% {
    transform: translateY(0);
  }
}

.d {
  animation: dots 1.5s ease-out infinite;
}
.d-2 {
  animation-delay: 0.5s;
}
.d-3 {
  animation-delay: 1s;
}
.img-container {
  width: 120px;
  height: 120px;
}
.full-screen {
  height: 100%;
}
</style>
