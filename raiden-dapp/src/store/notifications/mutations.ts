import {
  NotificationPayload,
  NotificationsState,
  NotificationDictionary,
} from '@/store/notifications/types';
import { MutationTree } from 'vuex';
import { NotificationContext } from './notification-context';

function generateNotificationId(notifications: NotificationDictionary) {
  const id = Object.values(notifications).map(
    (notification) => notification.id
  );
  return Math.max(...id, 0) + 1;
}

export const mutations: MutationTree<NotificationsState> = {
  notificationDelete(state: NotificationsState, id: number) {
    const remainingNotifications = { ...state.notifications };
    delete remainingNotifications[id];
    state.notifications = remainingNotifications;
  },
  notificationsViewed(state: NotificationsState) {
    state.newNotifications = false;
  },
  notificationAddOrReplace(
    state: NotificationsState,
    payload: NotificationPayload
  ) {
    const { notifications } = state;
    const notificationsWithSameTxHash = Object.values(notifications).filter(
      ({ txHash }) => txHash && txHash === payload.txHash
    );
    const id =
      notificationsWithSameTxHash[0]?.id ??
      generateNotificationId(notifications);
    const display = notificationsWithSameTxHash[0]?.id ? false : true;

    const notification: NotificationPayload = {
      ...payload,
      id,
      received: new Date(),
      display,
      context: payload.context ?? NotificationContext.NONE,
      duration: payload.duration ?? 5000,
    };

    state.notifications = {
      ...notifications,
      [notification.id]: notification,
    };
    state.newNotifications = true;
  },
  setNotificationShown(state: NotificationsState, id: number) {
    state.notifications[id].display = false;
  },
  clear(state: NotificationsState) {
    state.notifications = [];
  },
};
