<template>
  <v-form autocomplete="off" v-model="valid">
    <v-layout align-center justify-center row>
      <v-flex xs10 md10 lg10>
        <div class="screen-title">Select Hub</div>
      </v-flex>
    </v-layout>

    <v-layout align-center justify-center row>
      <v-flex xs10 md10 lg10>
        <address-input
          :ens="true"
          class="address-input"
          v-model="partner"
          :tokenMode="false"
        ></address-input>
      </v-flex>
    </v-layout>

    <v-layout align-center justify-center row>
      <div class="divider"></div>
    </v-layout>

    <v-layout align-center justify-center class="section">
      <v-flex xs10 md10 lg10 class="text-xs-center">
        <v-btn
          class="text-capitalize confirm-button"
          depressed
          id="select-hub"
          :disabled="!valid"
          large
          @click="selectHub()"
        >
          Select Hub
        </v-btn>
      </v-flex>
    </v-layout>
  </v-form>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Token } from '@/model/types';
import AddressInput from '@/components/AddressInput.vue';

@Component({
  components: { AddressInput }
})
export default class SelectHub extends Vue {
  @Prop({ required: true })
  token!: Token;

  partner: string = '';
  valid: boolean = false;
  selectHub() {
    this.$router.push({
      name: 'connect',
      params: {
        token: this.token.address,
        partner: this.partner
      }
    });
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/input-screen';

.address-input {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 60px;
  padding-bottom: 60px;
  border: 0;

  @include respond-to(handhelds) {
    padding-top: 30px;
    padding-bottom: 30px;
    border: 0;
  }
}

.address-input /deep/ input {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 30px;
  font-weight: 500;
  line-height: 38px;
  text-align: center;
  max-height: 40px;
  padding-left: 6px;
  padding-right: 6px;
}
.address-input /deep/ input:focus {
  outline: 0;
}

.address-input /deep/ .v-text-field__details {
  height: 36px;
  padding-top: 4px;
}

.address-input /deep/ .v-messages {
  color: white !important;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

form {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
