<template>
  <v-row class="list-header" no-gutters>
    <v-col cols="12">
      <div class="list-header__header">{{ header }}</div>
      <div class="list-header__divider"></div>
    </v-col>
  </v-row>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class ListHeader extends Vue {
  @Prop({ required: true })
  header!: string;
}
</script>

<style scoped lang="scss">
@import '../scss/fonts';

.list-header {
  &__header {
    color: #ffffff;
    font-family: $main-font;
    font-size: 16px;
    font-weight: bold;
    line-height: 19px;
    text-transform: uppercase;
    padding-left: 20px;
    padding-bottom: 8px;
  }

  &__divider {
    box-sizing: border-box;
    height: 1px;
    width: 100%;
    border: 1.5px solid #0a6e87;
    transform: scaleY(-1);
  }
}
</style>
