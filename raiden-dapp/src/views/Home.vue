<template>
  <div class="content-host">
    <app-core />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import AppCore from '@/components/AppCore.vue';

@Component({
  components: {
    AppCore
  }
})
export default class Home extends Vue {}
</script>

<style scoped lang="scss">
@import '../main';
</style>
