<template>
  <div class="content-host">
    <no-valid-provider v-if="!providerDetected" />
    <no-access-screen v-else-if="accessDenied" :reason="accessDenied" />
    <app-core v-else />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import AppCore from '@/components/AppCore.vue';
import NoValidProvider from '@/components/NoValidProvider.vue';
import NoAccessScreen from '@/components/NoAccessScreen.vue';
import { mapState } from 'vuex';
import { DeniedReason } from '@/model/types';

@Component({
  components: {
    NoAccessScreen,
    AppCore,
    NoValidProvider
  },
  computed: mapState(['providerDetected', 'accessDenied'])
})
export default class Home extends Vue {
  providerDetected!: boolean;
  accessDenied!: DeniedReason;
}
</script>

<style scoped lang="scss">
@import '../main';
</style>
