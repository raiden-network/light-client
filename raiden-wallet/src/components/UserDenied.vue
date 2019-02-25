<template>
  <v-container>
    <v-layout align-center justify-center row fill-height>
      <v-flex xs12 md6>
        <v-icon size="80px">lock</v-icon>
        <h1 class="font-weight-light">Access was denied by the user</h1>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class UserDenied extends Vue {}
</script>

<style scoped></style>
