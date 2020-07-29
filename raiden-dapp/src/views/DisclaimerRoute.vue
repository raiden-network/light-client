<template>
  <v-container fluid class="disclaimer">
    <v-row no-gutters>
      <v-col cols="10" offset="1">
        <div class="disclaimer__paragraphs">
          <p
            v-for="(paragraph, index) in $t('disclaimer.paragraphs')"
            :key="index"
          >
            {{ paragraph }}
          </p>
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
import { Component, Vue } from 'vue-property-decorator';
import ActionButton from '@/components/ActionButton.vue';
import { RouteNames } from '@/router/route-names';

@Component({
  components: { ActionButton },
})
export default class Disclaimer extends Vue {
  checkedAccept = false;
  checkedHide = false;

  get navigationTarget() {
    const redirectTo = this.$route.query.redirectTo;

    if (redirectTo) {
      return { path: redirectTo };
    } else {
      return { name: RouteNames.HOME };
    }
  }

  accept(): void {
    this.$store.commit('acceptDisclaimer');
    this.$router.push(this.navigationTarget);
  }
}
</script>

<style lang="scss" scoped>
.disclaimer {
  &__paragraphs {
    text-align: justify;
  }
}
</style>
