<template>
  <v-row class="error-message">
    <v-col cols="12">
      <div class="error-message__image">
        <v-img :src="require('../assets/error.png')" />
      </div>
      <h2 class="error-message__title">{{ title }}</h2>
      <label class="error-message__label">
        {{ $t('error-message.problem') }}
      </label>
      <p>{{ problem }}</p>
      <label v-if="solution" class="error-message__label">
        {{ $t('error-message.solution') }}
      </label>
      <ol v-if="Array.isArray(solution)">
        <li v-for="step in solution" :key="step">{{ step }}</li>
      </ol>
      <p v-else>{{ solution }}</p>
    </v-col>
  </v-row>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { RaidenError } from 'raiden-ts';

@Component({})
export default class ErrorMessage extends Vue {
  @Prop({ required: true })
  error!: Error | RaidenError | null;

  get code() {
    return this.error &&
      typeof this.error === 'object' &&
      'code' in this.error &&
      this.$te(`errors.${this.error.code}.title`)
      ? this.error.code
      : 'RDN_GENERAL_ERROR';
  }

  get title() {
    return this.$t(`errors.${this.code}.title`);
  }

  get problem() {
    if (
      this.code === 'RDN_GENERAL_ERROR' &&
      typeof this.error?.message === 'string'
    ) {
      return this.error.message;
    }
    return this.$t(`errors.${this.code}.problem`);
  }

  get solution() {
    if (
      this.code === 'RDN_GENERAL_ERROR' &&
      typeof this.error?.message === 'string'
    ) {
      return undefined;
    }
    return this.$t(`errors.${this.code}.solution`);
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';

.error-message {
  width: 100%;
  text-align: left;

  &__label {
    font-weight: bold;
    margin-right: 5px;
  }

  &__title {
    width: 100%;
    text-align: center;
    margin-bottom: 7px;
  }

  &__image {
    max-width: 75px;
    margin: 0 auto;
  }
}
</style>
