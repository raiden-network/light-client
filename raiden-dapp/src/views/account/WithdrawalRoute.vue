<template>
  <withdrawal></withdrawal>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Withdrawal from '@/components/account/Withdrawal.vue';

@Component({
  components: { Withdrawal }
})
export default class WithdrawalRoute extends Vue {}
</script>

<style scoped></style>
