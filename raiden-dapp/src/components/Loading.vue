<template>
  <v-container fluid fill-height>
    <v-layout align-center justify-center>
      <v-flex lg6 md8 xs10 class="display-3">
        <div class="loading-wrapper">
          <div class="img-container">
            <v-img
              id="logo"
              aspect-ratio="1"
              contain
              :src="require('../assets/logo.svg')"
            />
          </div>
          <div id="text-information">
            <div>
              Raiden Wallet
            </div>
            <div class="font-weight-light loading">
              Loading
              <div id="wave">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>
            </div>
          </div>
        </div>
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
#logo {
  filter: invert(100%);
}

$wave-size: 2.5rem;
$wave-horizontal-margin: 2rem;
div#wave {
  text-align: center;
  width: $wave-size;
  height: $wave-size;
  margin-left: $wave-horizontal-margin;

  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 3px;
    background: #303131;
    animation: wave 1.3s linear infinite;

    &:nth-child(2) {
      animation-delay: -1.1s;
    }

    &:nth-child(3) {
      animation-delay: -0.9s;
    }
  }
}

$name-horizontal-margin: 2rem;
#text-information {
  margin-left: $name-horizontal-margin;
  margin-right: $name-horizontal-margin;
}

@keyframes wave {
  0%,
  60%,
  100% {
    transform: initial;
  }

  30% {
    transform: translateY(-15px);
  }
}
.img-container {
  width: 8rem;
  padding: 1.4rem;
}
.loading {
  font-size: 2.5rem;
  display: flex;
}

.loading-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
