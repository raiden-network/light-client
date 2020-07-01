<template>
  <v-snackbar
    v-model="notification.display"
    :timeout="notification.duration"
    top
    centered
    vertical
    app
    rounded
    max-width="550px"
    @input="notificationShown(notification.id)"
  >
    <v-row no-gutters class="notification-area__notification__content">
      <v-col
        v-if="notification.context !== 'none'"
        cols="auto"
        class="notification-area__notification__content__icon d-flex flex-column"
      >
        <v-img
          aspect-ratio="1"
          :class="`notification-area__notification__content__icon--${notification.context}`"
          contain
          :src="require(`@/assets/${notification.context}.svg`)"
          height="48px"
          width="48px"
        ></v-img>
      </v-col>
      <v-col>
        <v-row no-gutters>
          <v-col>
            <h3 class="text--primary title">{{ notification.title }}</h3>
          </v-col>
          <v-col v-if="notificationQueue.length >= 1" cols="auto">
            <v-badge
              inline
              :content="notificationQueue.length"
              color="info"
              class="notification-area__notification__content__count"
            />
          </v-col>
        </v-row>
        <v-row no-gutters>
          <v-col>
            <p
              class="text--secondary caption notification-area__notification__content__description text-justify"
            >
              {{ notification.description }}
            </p>
          </v-col>
        </v-row>
      </v-col>
    </v-row>
    <template #action="{ attrs }">
      <v-btn dark text left v-bind="attrs" @click="dismiss(notification.id)">
        {{ $t('notification-area.dismiss') }}
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { mapActions, mapGetters } from 'vuex';
import { NotificationPayload } from '@/store/notifications/types';
import { NotificationImportance } from '@/store/notifications/notification-importance';
import { NotificationContext } from '@/store/notifications/notification-context';

const emptyNotification: NotificationPayload = {
  id: -1,
  title: '',
  description: '',
  display: false,
  duration: 5000,
  importance: NotificationImportance.LOW,
  context: NotificationContext.NONE,
  received: new Date(),
};

@Component({
  computed: {
    ...mapGetters('notifications', ['notificationQueue']),
  },
  methods: {
    ...mapActions('notifications', ['notificationShown']),
  },
})
export default class NotificationArea extends Vue {
  notification: NotificationPayload = emptyNotification;
  notificationQueue!: NotificationPayload[];
  notificationShown!: (notificationId: number) => void;

  @Watch('notificationQueue', { deep: true })
  onQueueChange() {
    if (!this.notification.display && this.notificationQueue.length > 0) {
      const nextNotification = this.notificationQueue.shift();
      if (!nextNotification) {
        return;
      }
      this.$nextTick(() => (this.notification = nextNotification));
    }
  }

  created() {
    this.notification = emptyNotification;
  }

  dismiss(notificationId: number) {
    this.notificationShown(notificationId);
    this.notification = { ...this.notification, display: false };
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/scroll';

.notification-area {
  &__notification {
    &__content {
      max-width: 500px;
      &__count {
        padding-left: 5px;
      }

      &__description {
        max-width: 400px;
        max-height: 200px;
        overflow-x: hidden;
        overflow-y: scroll;
        padding-right: 8px;
        text-overflow: ellipsis;
        @extend .themed-scrollbar;
      }

      &__icon {
        padding-left: 8px;
        padding-right: 22px;
        &--warning {
          ::v-deep {
            .v-image {
              &__image {
                /* blue to red */
                filter: hue-rotate(165deg);
              }
            }
          }
        }

        &--error {
          ::v-deep {
            .v-image {
              &__image {
                /* blue to red */
                filter: hue-rotate(165deg);
              }
            }
          }
        }

        &--info {
          ::v-deep {
            .v-image {
              &__image {
                /* blue to green */
                filter: hue-rotate(270deg);
              }
            }
          }
        }
      }
    }
  }
}
</style>
