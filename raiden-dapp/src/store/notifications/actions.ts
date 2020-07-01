import { ActionTree } from 'vuex';
import { RootState } from '@/types';
import { Notification, NotificationsState } from '@/store/notifications/types';

export const actions: ActionTree<NotificationsState, RootState> = {
  notify: (
    { commit, getters: { nextNotificationId } },
    notification: Notification
  ) => {
    const payload: Notification = {
      ...notification,
      id: nextNotificationId,
      received: new Date(),
    };
    commit('notificationAdd', payload);
    commit('notificationShow', payload);
  },
};
