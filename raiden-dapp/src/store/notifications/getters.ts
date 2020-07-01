import { GetterTree } from 'vuex';
import { RootState } from '@/types';
import {
  NotificationPayload,
  NotificationsState,
} from '@/store/notifications/types';
import { NotificationImportance } from '@/store/notifications/notification-importance';

export const getters: GetterTree<NotificationsState, RootState> = {
  notifications: (state: NotificationsState): NotificationPayload[] => {
    return state.notifications.sort((a, b) => b.id - a.id);
  },
  nextNotificationId: ({ notifications }: NotificationsState): number => {
    if (notifications.length === 0) {
      return 1;
    }
    return (
      notifications
        .map((notification) => notification.id)
        .sort((a, b) => b - a)[0] + 1
    );
  },
  notificationQueue: (state: NotificationsState): NotificationPayload[] => {
    return state.notifications.filter(
      (notification) =>
        notification.importance === NotificationImportance.HIGH &&
        notification.display === true
    );
  },
};
