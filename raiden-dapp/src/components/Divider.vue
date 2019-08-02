<template>
  <div class="divider">
    <div class="divider__line"></div>
  </div>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class Divider extends Vue {}
</script>
<style lang="scss" scoped>
@import '../scss/colors';

.divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 20px;
  padding-bottom: 20px;
}

.divider__line {
  box-sizing: border-box;
  height: 1px;
  width: 520px;
  border: 1.5px solid $secondary-color;
}
</style>
