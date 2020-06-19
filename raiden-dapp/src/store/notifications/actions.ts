import { ActionTree } from 'vuex';
import { RootState } from '@/types';
import { NotificationsState } from '@/store/notifications/types';

export const actions: ActionTree<NotificationsState, RootState> = {
  notify: (
    { commit, getters: { nextNotificationId } },
    notification: Notification
  ) => {
    commit('notificationAdd', {
      ...notification,
      id: nextNotificationId,
      received: new Date()
    });
  }
};
