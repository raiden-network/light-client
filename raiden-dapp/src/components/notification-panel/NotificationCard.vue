<template>
  <v-card data-cy="notification_card" class="notification-card" flat>
    <v-row class="notification-card__content" no-gutters>
      <v-avatar class="notification-card__content__icon" size="44" rounded>
        <img :src="require(`@/assets/${notification.icon}.svg`)" />
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
          v-if="notification.txConfirmationBlock"
          class="notification-card__content__details__block-count"
        >
          <span v-if="blockCountInProgress">
            {{ $t('notifications.block-count-progress') }}
            {{ notification.txConfirmationBlock - blockNumber }}
          </span>
          <span v-else>
            {{ $t('notifications.channel-open.success.block-count-success') }}
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
        <img :src="require('@/assets/notification_trash.svg')" />
      </v-btn>
    </v-row>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Mixins } from 'vue-property-decorator';
import { NotificationPayload } from '@/store/notifications/types';
import { createNamespacedHelpers, mapState } from 'vuex';
import NotificationDescriptionDisplay from '@/components/notification-panel/NotificationDescriptionDisplay.vue';
import NavigationMixin from '../../mixins/navigation-mixin';

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
export default class NotificationCard extends Mixins(NavigationMixin) {
  notificationDelete!: (id: number) => void;
  blockNumber!: number;

  @Prop({ required: true })
  notification!: NotificationPayload;

  get blockCountInProgress(): boolean {
    if (this.notification.txConfirmationBlock) {
      return (
        !this.notification.txConfirmed &&
        this.notification.txConfirmationBlock > this.blockNumber
      );
    } else {
      return false;
    }
  }

  get linkRoute() {
    switch (this.notification.dappRoute) {
      case 'backup state route':
        return () => this.navigateToBackupState();
        break;
      default:
        break;
    }
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';
@import '@/scss/scroll';

.notification-card {
  background-color: $notification-card-bg;
  border-radius: 16px !important;
  height: 110px;

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
