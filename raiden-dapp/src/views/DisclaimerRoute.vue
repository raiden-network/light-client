<template>
  <div data-cy="disclaimer" class="disclaimer">
    <div class="disclaimer__content">
      <div class="disclaimer__content__paragraphs font-weight-light">
        <p
          v-for="(paragraph, index) in $t('disclaimer.paragraphs')"
          :key="index"
        >
          {{ paragraph }}
        </p>
      </div>
      <v-checkbox
        v-model="checkedAccept"
        data-cy="disclaimer_accept_checkbox"
        class="disclaimer__content__accept-checkbox"
        :label="$t('disclaimer.accept-checkbox')"
        dense
        hide-details
      />
      <v-checkbox
        v-model="checkedPersist"
        data-cy="disclaimer_persist_checkbox"
        class="disclaimer__content__persist-checkbox"
        :label="$t('disclaimer.persist-checkbox')"
        dense
        hide-details
      />
    </div>
    <action-button
      :text="$t('disclaimer.accept-button')"
      data-cy="disclaimer_accept_button"
      class="disclaimer__accept-button"
      :enabled="checkedAccept"
      sticky
      @click="accept"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import ActionButton from '@/components/ActionButton.vue';
import { RouteNames } from '@/router/route-names';
import { Location } from 'vue-router';

@Component({
  components: { ActionButton }
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
  height: 100%;
  width: 100%;

  &__content {
    border-top: solid 1px $primary-color;
    display: flex;
    flex-direction: column;
    height: calc(100% - 45px);
    padding: 30px 45px 0 45px;
    @include respond-to(handhelds) {
      padding: 10px 15px 0 15px;
    }

    &__paragraphs {
      flex: 1;
      font-size: 15px;
      overflow-y: auto;
      text-align: justify;
      @extend .themed-scrollbar;
    }

    &__accept-checkbox,
    &__persist-checkbox {
      flex: none;
      margin-top: 4px;
      margin-bottom: 8px;
      ::v-deep {
        .v-label {
          font-size: 13px;
        }
      }
    }
  }
}
</style>
