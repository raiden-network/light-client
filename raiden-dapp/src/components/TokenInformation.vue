<template>
  <v-layout align-start justify-center row class="token-information">
    <v-flex xs2>
      <div class="token-information__label">
        {{ $t('token-information.title') }}
      </div>
    </v-flex>
    <v-flex xs8>
      <div class="token-information__description">
        {{
          $t('token-information.description', {
            symbol: token.symbol,
            name: token.name
          })
        }}
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
.token-information {
  max-height: 55px;
  padding-top: 5px;
}

.token-information__label {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  font-weight: bold;
  line-height: 19px;
  text-transform: uppercase;
}

.token-information__description {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 20px;
  overflow-x: hidden;
  text-overflow: ellipsis;
}
</style>
