<template>
  <div id="overlay" v-if="display">
    <v-progress-circular
      :size="70"
      :width="7"
      color="blue"
      indeterminate
    ></v-progress-circular>
    <p id="message">{{ message }}</p>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class ProgressOverlay extends Vue {
  @Prop({ required: true })
  display!: boolean;

  @Prop({ required: true })
  message!: string;
}
</script>

<style lang="scss" scoped>
#overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: fixed;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 9000;
}

#message {
  color: white;
  font-size: 2rem;
  margin-top: 2rem;
}
</style>
