<template>
  <v-container fluid>
    <div class="disclaimer">
      <div class="disclaimer__paragraphs font-weight-light">
        <p
          v-for="(paragraph, index) in $t('disclaimer.paragraphs')"
          :key="index"
        >
          {{ paragraph }}
        </p>
      </div>
      <v-checkbox
        v-model="checkedAccept"
        class="disclaimer__accept-checkbox"
        :label="$t('disclaimer.accept-checkbox')"
        dense
        hide-details
      />
      <v-checkbox
        v-model="checkedPersist"
        class="disclaimer__persist-checkbox"
        :label="$t('disclaimer.persist-checkbox')"
        dense
        hide-details
      />
    </div>
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
import { Location } from 'vue-router';

@Component({
  components: { ActionButton },
})
export default class Disclaimer extends Vue {
  checkedAccept = false;
  checkedPersist = false;

  get navigationTarget(): Location {
    const redirectTo = this.$route.query.redirectTo as string;

    if (redirectTo) {
      return { path: redirectTo };
    } else {
      return { name: RouteNames.HOME };
    }
  }

  accept(): void {
    this.$store.commit('acceptDisclaimer', this.checkedPersist);
    this.$router.push(this.navigationTarget);
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';
@import '@/scss/scroll';
@import '@/scss/mixins';

.disclaimer {
  border-top: solid 1px $primary-color;
  display: flex;
  flex-direction: column;
  height: calc(100% - 45px);
  padding: 30px 30px 0 30px;
  width: 100%;
  @include respond-to(handhelds) {
    padding-top: 10px;
  }

  &__paragraphs {
    font-size: 15px;
    overflow-y: auto;
    text-align: justify;
    @extend .themed-scrollbar;
  }

  &__accept-checkbox,
  &__persist-checkbox {
    ::v-deep {
      .v-label {
        font-size: 14px;
        padding-bottom: 2px;
      }
    }
  }
}
</style>
