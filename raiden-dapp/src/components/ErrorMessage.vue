<template>
  <v-row class="error-message">
    <div>
      <v-img class="error-message__image" :src="require('../assets/error.png')" />
    </div>

    <h2 class="error-message__title">{{ title }}</h2>

    <p>{{ problem }}</p>
    <div v-html="solution"/>
  </v-row>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import RaidenError from 'raiden-ts/dist/utils/error';

@Component({})
export default class ErrorMessage extends Vue {
  @Prop({ required: true })
  error!: Error | RaidenError;

  get code() {
    return 'code' in this.error && this.$te(`errors.${this.error.code}.title`)
      ? this.error.code
      : 'RDN_GENERAL_ERROR';
  }

  get title() {
    return this.$t(`errors.${this.code}.title`);
  }

  get problem() {
    return this.$t(`errors.${this.code}.problem`);
  }

  get solution() {
    return this.$t(`errors.${this.code}.solution`);
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';

.error-message {
  width: 100%;
  justify-content: center;
  text-align: left;

  &__title {
    width: 100%;
    text-align: center;
  }

  &__image {
    max-width: 75px;
    margin: 0 auto;
  }
}
</style>
