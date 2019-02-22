<template>
  <v-form>
    <v-container>
      <h1 class="font-weight-light">Open Channel</h1>

      <v-layout align-center justify-center row fill-height>
        <v-flex xs8 md6>
          <v-text-field
            class="font-weight-thin deposit"
            label=""
            mask="#.#########"
            placeholder="0.0"
          ></v-text-field>
        </v-flex>
      </v-layout>
      <v-btn>Open</v-btn>
    </v-container>
  </v-form>
</template>

<script lang="ts">
import Vue from 'vue';
import Component from 'vue-class-component';

@Component({})
export default class OpenChannel extends Vue {}
</script>

<style lang="scss" scoped>
.deposit {
  font-size: 8em;
}

.deposit /deep/ input {
  max-height: 210px;
}
</style>
