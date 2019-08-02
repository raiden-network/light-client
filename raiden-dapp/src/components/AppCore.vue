<template>
  <tokens />
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Tokens from '@/components/Tokens.vue';

@Component({
  components: { Tokens }
})
export default class AppCore extends Vue {}
</script>
