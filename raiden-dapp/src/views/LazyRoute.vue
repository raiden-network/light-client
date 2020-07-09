<template>
  <v-container>
    <slot v-if="isConnected"></slot>
    <home v-else></home>
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Home from '@/views/Home.vue';
import { mapGetters } from 'vuex';

@Component({
  computed: {
    ...mapGetters(['isConnected']),
  },
  components: { Home },
})
export default class LazyRoute extends Vue {
  isConnected!: boolean;
}
</script>

<style scoped></style>
