<template>
  <v-card class="raiden-dialog">
    <v-btn icon class="raiden-dialog__close" @click="close()">
      <v-icon>mdi-close</v-icon>
    </v-btn>
    <slot></slot>
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
  padding: 25px;

  &__close {
    position: absolute;
    right: 15px;
    top: 15px;
  }
}
</style>
