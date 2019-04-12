<template>
  <v-layout row justify-center>
    <v-dialog v-model="display" persistent max-width="450">
      <v-card>
        <v-card-title class="headline">
          <slot name="title"></slot>
        </v-card-title>
        <v-card-text>
          <slot></slot>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary darken-1" flat @click="cancel()">
            Cancel
          </v-btn>
          <v-btn color="primary darken-1" flat @click="confirm()">
            Confirm
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-layout>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class ConfirmationDialog extends Vue {
  @Prop({ required: true })
  display!: boolean;

  confirm() {
    this.$emit('confirm');
  }

  cancel() {
    this.$emit('cancel');
  }
}
</script>

<style scoped></style>
