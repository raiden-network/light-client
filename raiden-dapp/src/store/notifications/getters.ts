import { GetterTree } from 'vuex';
import { RootState } from '@/types';
import { Notification, NotificationsState } from '@/store/notifications/types';

export const getters: GetterTree<NotificationsState, RootState> = {
  notifications: (state: NotificationsState): Notification[] => {
    return state.notifications.sort((a, b) => b.id - a.id);
  },
  nextNotificationId: ({ notifications }: NotificationsState): number => {
    if (notifications.length === 0) {
      return 1;
    }
    return notifications
      .map(notification => notification.id)
      .sort((a, b) => b - a)[0];
  }
};
