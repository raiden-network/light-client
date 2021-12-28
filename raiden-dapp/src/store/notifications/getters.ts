import type { GetterTree } from 'vuex';

import { NotificationImportance } from '@/store/notifications/notification-importance';
import type {
  NotificationPayload,
  NotificationsState,
  RootStateWithNotifications,
} from '@/store/notifications/types';

function compareById(a: NotificationPayload, b: NotificationPayload): number {
  return b.id - a.id;
}

type Getters = {
  notifications(state: NotificationsState): NotificationPayload[];
  notificationQueue(state: NotificationsState): NotificationPayload[];
};

export const getters: GetterTree<NotificationsState, RootStateWithNotifications> & Getters = {
  notifications: (state: NotificationsState): NotificationPayload[] => {
    return Object.values(state.notifications).sort(compareById);
  },
  notificationQueue: (state: NotificationsState): NotificationPayload[] => {
    return Object.values(state.notifications)
      .filter(
        (notification) =>
          notification.importance === NotificationImportance.HIGH && notification.display === true,
      )
      .sort(compareById);
  },
};
