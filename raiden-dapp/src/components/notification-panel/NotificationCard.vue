<template>
  <v-card class="notification-card">
    <v-row class="notification-card__content" no-gutters>
      <v-col cols="3">
        <v-avatar
          class="notification-card__content__icon"
          tile
          size="80"
          color="grey"
        />
      </v-col>
      <v-col class="notification-card__content__details">
        <div class="notification-card__content__details__header">
          <div
            class="notification-card__content__details__header--title text--primary title"
          >
            {{ notification.title }}
          </div>
          <v-btn
            icon
            x-small
            class="notification-card__dismiss"
            @click="notificationDelete(notification.id)"
          >
            <v-icon icon>mdi-close</v-icon>
          </v-btn>
        </div>
        <div
          class="notification-card__content__details__description text--secondary"
        >
          <span>{{ notification.description }}</span>
        </div>
        <span class="notification-card__content__details--received">
          {{ notification.received | formatDate }}
        </span>
      </v-col>
    </v-row>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Notification } from '@/store/notifications/types';
import { createNamespacedHelpers } from 'vuex';

const { mapMutations } = createNamespacedHelpers('notifications');

@Component({
  methods: {
    ...mapMutations(['notificationDelete'])
  }
})
export default class NotificationCard extends Vue {
  @Prop({ required: true })
  notification!: Notification;

  notificationDelete!: (id: number) => void;
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';
@import '@/scss/scroll';

.notification-card {
  background-color: $notification-card-background;
  border-radius: 20px !important;
  height: 200px;

  &__dismiss {
    padding-left: 14px;
  }

  &__content {
    height: 100%;
    padding: 30px 30px 0 30px;

    &__details {
      display: flex;
      flex-direction: column;
      max-width: 350px;

      &__header {
        display: flex;

        &--title {
          overflow-x: hidden;
          text-overflow: ellipsis;
          display: flex;
          flex: 1;
        }
      }

      &__description {
        margin-top: 10px;
        max-height: 100px;
        overflow-y: scroll;
        padding-bottom: 10px;
        @extend .themed-scrollbar;
      }

      &--received {
        color: $secondary-text-color;
        display: flex;
        align-items: flex-end;
        flex: 1;
        padding-bottom: 30px;
        font-size: 12px;
      }
    }

    &__icon {
      margin-top: 5px;
    }
  }
}
</style>
