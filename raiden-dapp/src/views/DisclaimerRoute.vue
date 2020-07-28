<template>
  <v-container fluid class="disclaimer">
    <v-row no-gutters>
      <v-col cols="10" offset="1">
        <div class="disclaimer__content">
          {{ $t('disclaimer.content') }}
        </div>
        <v-checkbox
          v-model="checkedAccept"
          :label="$t('disclaimer.accept-checkbox')"
        />
        <v-checkbox
          v-model="checkedHide"
          :label="$t('disclaimer.hide-checkbox')"
        />
      </v-col>
    </v-row>
    <action-button
      :text="$t('disclaimer.accept-button')"
      :enabled="checkedAccept"
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
  checkedAccept = false;
  checkedHide = false;

  accept() {
    this.$store.commit('acceptDisclaimer');
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
