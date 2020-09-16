import { ActionTree } from 'vuex';
import { RootState } from '@/types';
import {
  NotificationPayload,
  NotificationsState,
} from '@/store/notifications/types';
import { NotificationContext } from '@/store/notifications/notification-context';

export const actions: ActionTree<NotificationsState, RootState> = {
  notify: (
    { commit, state, getters: { nextNotificationId } },
    notification: NotificationPayload
  ) => {
    const notificationsWithSameTxHash = Object.values(
      state.notifications
    ).filter(({ txHash }) => txHash && txHash === notification.txHash);
    const id = notificationsWithSameTxHash[0]?.id ?? nextNotificationId;

    const payload: NotificationPayload = {
      ...notification,
      id,
      received: new Date(),
      display: true,
      context: notification.context ?? NotificationContext.NONE,
      duration: notification.duration ?? 5000,
    };
    commit('notificationAddOrReplace', payload);
  },
};
