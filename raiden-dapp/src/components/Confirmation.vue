<template>
  <div class="body">
    <v-layout class="description-wrapper" row align-center justify-center>
      <v-flex class="description">
        <slot></slot>
      </v-flex>
    </v-layout>
    <v-layout row align-end justify-center class="action-buttons">
      <v-btn
        :id="`cancel-${identifier}`"
        class="text-capitalize cancel-button"
        @click="cancel()"
      >
        Cancel
      </v-btn>
      <v-btn
        :id="`confirm-${identifier}`"
        class="text-capitalize"
        @click="confirm()"
      >
        Close
      </v-btn>
    </v-layout>
  </div>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class Confirmation extends Vue {
  @Prop({ required: true })
  identifier!: number;

  @Emit()
  public cancel() {}

  @Emit()
  public confirm() {}
}
</script>

<style scoped lang="scss">
.body {
  height: 250px;
  padding: 25px;
  background-color: #e4e4e4;
  box-shadow: 10px 10px 15px 0 rgba(0, 0, 0, 0.3);
}

.description {
  padding-top: 10px;
}

.description-wrapper > * {
  height: 100px;
  color: #050505;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

.action-buttons button {
  width: 125px;
  height: 40px;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
  border-radius: 29px;
  margin-left: 25px;
  margin-right: 25px;
}

.cancel-button {
  background-color: transparent !important;
  border: 2px solid #050505;
  color: #050505;
}
</style>
