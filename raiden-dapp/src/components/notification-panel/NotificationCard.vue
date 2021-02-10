<template>
  <v-card data-cy="notification_card" class="notification-card" flat>
    <v-row class="notification-card__content" no-gutters>
      <v-avatar class="notification-card__content__icon" size="44" rounded>
        <img :src="require(`@/assets/notifications/${iconName}.svg`)" />
      </v-avatar>
      <div class="notification-card__content__details">
        <span class="notification-card__content__details__title">
          {{ notification.title }}
        </span>
        <notification-description-display
          class="notification-card__content__details__description"
          :description="notification.description"
        />
        <div
          v-if="showConfirmationCounter"
          class="notification-card__content__details__block-count"
        >
          <span>
            {{ $t('notifications.block-count-progress') }}
            {{ blocksUntilTxConfirmation }}
          </span>
        </div>
        <span
          v-if="notification.link"
          class="notification-card__content__details__link"
          @click="linkRoute"
        >
          {{ notification.link }}
        </span>
        <span class="notification-card__content__details__received">
          {{ notification.received | formatDate }}
        </span>
      </div>
      <v-btn
        x-small
        icon
        data-cy="notification_card_delete_button"
        class="notification-card__delete-button"
        @click="notificationDelete(notification.id)"
      >
        <img :src="require('@/assets/notifications/notification_trash.svg')" />
      </v-btn>
    </v-row>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { createNamespacedHelpers, mapState } from 'vuex';

import NotificationDescriptionDisplay from '@/components/notification-panel/NotificationDescriptionDisplay.vue';
import type { NotificationPayload } from '@/store/notifications/types';

const { mapMutations } = createNamespacedHelpers('notifications');

@Component({
  components: {
    NotificationDescriptionDisplay,
  },
  computed: mapState(['blockNumber']),
  methods: {
    ...mapMutations(['notificationDelete']),
  },
})
export default class NotificationCard extends Vue {
  blockNumber!: number;
  notificationDelete!: (id: number) => void;

  @Prop({ required: true })
  notification!: NotificationPayload;

  get iconName(): string {
    return this.notification.icon ?? 'notification_fallback';
  }

  get blocksUntilTxConfirmation(): number | undefined {
    const { txConfirmationBlock } = this.notification;

    if (txConfirmationBlock) {
      return txConfirmationBlock - this.blockNumber;
    }
    // Else notification is not related to a blockchain transaction
  }

  get showConfirmationCounter(): boolean {
    return this.blocksUntilTxConfirmation !== undefined && this.blocksUntilTxConfirmation > 0;
  }

  linkRoute() {
    this.$router.push({ name: this.notification.dappRoute });
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';
@import '@/scss/scroll';

.notification-card {
  background-color: $notification-card-bg;
  border-radius: 16px !important;
  min-height: 110px;

  &__content {
    height: 100%;
    padding: 16px;

    &__icon {
      background-color: $notification-icon-bg;
      padding: 4px;
    }

    &__details {
      display: flex;
      flex: 1;
      flex-direction: column;
      margin-left: 16px;

      &__block-count,
      &__link,
      &__received {
        font-size: 12px;
      }

      &__title,
      &__link {
        color: $primary-color;
      }

      &__block-count {
        color: $color-white;
      }

      &__link {
        cursor: pointer;
        width: fit-content;
      }

      &__received {
        color: $secondary-text-color;
      }
    }
  }
}
</style>
