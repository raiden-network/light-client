<template>
  <v-progress-circular
    :size="110"
    :width="7"
    class="spinner"
    color="primary"
    indeterminate
  ></v-progress-circular>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class Spinner extends Vue {}
</script>

<style lang="scss" scoped>
@import '../scss/colors';
.spinner {
  color: $secondary-color;
}
</style>
