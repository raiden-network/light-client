<template>
  <v-container>
    <v-layout align-center justify-center row fill-height>
      <h1 class="font-weight-light">
        <span v-if="networkUnsupported">
          The selected network is not supported
        </span>
        <span v-else>
          Access was denied by the user
        </span>
      </h1>
    </v-layout>
  </v-container>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { DeniedReason } from '@/model/types';

@Component({})
export default class NoAccessScreen extends Vue {
  @Prop({ required: true })
  reason!: DeniedReason;

  get networkUnsupported(): boolean {
    return this.reason === DeniedReason.UNSUPPORTED_NETWORK;
  }
}
</script>

<style scoped></style>
