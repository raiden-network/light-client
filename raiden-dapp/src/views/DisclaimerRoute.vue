<template>
  <v-container fluid class="disclaimer">
    <v-row no-gutters>
      <v-col cols="10" offset="1">
        <div class="disclaimer__content">
          {{ $t('disclaimer.content') }}
        </div>
      </v-col>
    </v-row>
    <action-button
      :text="$t('disclaimer.accept-button')"
      :enabled="true"
      sticky
      @click="accept"
    />
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import ActionButton from '@/components/ActionButton.vue';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({
  components: { ActionButton },
})
export default class Disclaimer extends Mixins(NavigationMixin) {
  accept() {
    this.navigateToHome();
  }
}
</script>

<style lang="scss" scoped>
.disclaimer {
  &__content {
    text-align: justify;
  }
}
</style>
