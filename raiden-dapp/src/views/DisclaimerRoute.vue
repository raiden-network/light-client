<template>
  <div data-cy="disclaimer" class="disclaimer">
    <div class="disclaimer__content">
      <div class="disclaimer__content__text">
        <span class="disclaimer__content__text__header">
          {{ $t('disclaimer.user-info.header') }}
        </span>
        <span class="disclaimer__content__text__body">{{ $t('disclaimer.user-info.body') }}</span>
        <ul
          v-for="(bulletPoint, name) in $t('disclaimer.user-info.bullet-points')"
          :key="name"
          class="disclaimer__content__text__bullet-points"
        >
          <li>
            {{ bulletPoint.text }}
            <a :href="disclaimerUrlMappings[name]" target="_blank">
              {{ bulletPoint.link }}
            </a>
          </li>
        </ul>
        <span v-if="imprint && terms" class="disclaimer__content__text__header">
          {{ $t('disclaimer.terms.header') }}
        </span>
        <i18n
          v-if="imprint && terms"
          path="disclaimer.terms.body"
          tag="span"
          class="disclaimer__content__text__body"
        >
          <a :href="terms" target="_blank">
            {{ $t('disclaimer.terms.link-name-terms') }}
          </a>
          <a :href="imprint" target="_blank">
            {{ $t('disclaimer.terms.link-name-policy') }}
          </a>
        </i18n>
        <span class="disclaimer__content__text__header">
          {{ $t('disclaimer.disclaimer.header') }}
        </span>
        <span class="disclaimer__content__text__body">{{ $t('disclaimer.disclaimer.body') }}</span>
        <span class="disclaimer__content__text__header">
          {{ $t('disclaimer.privacy.header') }}
        </span>
        <div
          v-for="(paragraph, index) in $t('disclaimer.privacy.body')"
          :key="index"
          class="disclaimer__content__text__body"
        >
          <span>{{ paragraph }}</span>
        </div>
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
import { Location } from 'vue-router';
import ActionButton from '@/components/ActionButton.vue';
import { RouteNames } from '@/router/route-names';

@Component({
  components: { ActionButton },
})
export default class Disclaimer extends Vue {
  checkedAccept = false;
  checkedPersist = false;
  disclaimerUrlMappings = {
    portal: 'https://developer.raiden.network',
    docs: 'https://docs.raiden.network',
    videos: 'https://www.youtube.com/channel/UCoUP_hnjUddEvbxmtNCcApg',
    medium: 'https://medium.com/@raiden_network',
  };

  get imprint(): string | undefined {
    return process.env.VUE_APP_IMPRINT;
  }

  get terms(): string | undefined {
    return process.env.VUE_APP_TERMS;
  }

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

  a {
    text-decoration: none;
  }

  &__content {
    border-top: solid 1px $primary-color;
    display: flex;
    flex-direction: column;
    height: calc(100% - 45px);
    padding: 30px 45px 0 45px;
    @include respond-to(handhelds) {
      padding: 10px 15px 0 15px;
    }

    &__text {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      text-align: justify;
      @extend .themed-scrollbar;

      &__body,
      &__bullet-points {
        font-size: 14px;
      }

      &__header {
        font-weight: 500;
        padding-bottom: 6px;
      }

      &__body {
        padding: 0 4px 12px 0;
      }

      &__bullet-points {
        padding-bottom: 12px;
      }
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
