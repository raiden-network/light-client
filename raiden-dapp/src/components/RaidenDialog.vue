<template>
  <v-card class="raiden-dialog">
    <v-btn icon class="raiden-dialog__close" @click="close()">
      <v-icon>mdi-close</v-icon>
    </v-btn>
    <v-card-text>
      <slot></slot>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';

@Component({})
export default class RaidenDialog extends Vue {
  @Emit()
  close() {}
}
</script>

<style scoped lang="scss">
@import '../scss/colors';
.raiden-dialog {
  background-color: $card-background;

  &__close {
    position: absolute;
    right: 15px;
    top: 15px;
  }
}
</style>
