<template>
  <v-layout row>
    <v-flex xs12>
      <div class="header-text">{{ header }}</div>
      <div class="divider"></div>
    </v-flex>
  </v-layout>
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
.header-text {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  font-weight: bold;
  line-height: 19px;
  text-transform: uppercase;
  padding-left: 20px;
  padding-bottom: 8px;
}

.divider {
  box-sizing: border-box;
  height: 1px;
  width: 100%;
  border: 1.5px solid #0a6e87;
  transform: scaleY(-1);
}
</style>
