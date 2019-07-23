import {DeniedReason} from "@/model/types";
<template>
  <v-alert :value="true" color="error" icon="warning" outline>
    <div class="font-weight-light message">
      <span v-if="networkUnsupported">
        The current network is unsupported.
      </span>
      <span v-else-if="initializationFailed">
        SDK initialization failed. <br />
        Please check the console for more information.
      </span>
      <span v-else>
        A valid account could not be detected. <br />
        Please make sure that your provider is unlocked and accessible.
      </span>
    </div>
  </v-alert>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { DeniedReason } from '@/model/types';

@Component({})
export default class NoAccessMessage extends Vue {
  @Prop({ required: true })
  reason!: DeniedReason;

  get networkUnsupported(): boolean {
    return this.reason === DeniedReason.UNSUPPORTED_NETWORK;
  }

  get initializationFailed(): boolean {
    return this.reason === DeniedReason.INITIALIZATION_FAILED;
  }
}
</script>

<style scoped lang="scss">
.message {
  font-size: 16px;
  line-height: 20px;
}
</style>
