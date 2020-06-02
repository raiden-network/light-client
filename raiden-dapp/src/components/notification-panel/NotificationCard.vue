<template>
  <v-card class="notification-card">
    <div class="notification-card__details-wrapper">
      <v-avatar
        class="notification-card__details-wrapper__icon"
        tile
        size="80"
        color="grey"
      />
      <div>
        <v-card-title></v-card-title>
        <v-card-subtitle></v-card-subtitle>
      </div>
    </div>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class NotificationCard extends Vue {}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.notification-card {
  background-color: $notification-card-background;
  border-radius: 50px;
  height: 200px;

  &__details-wrapper {
    display: flex;

    &__icon {
      margin: 24px 10px 0 20px;
    }
  }
}
</style>
