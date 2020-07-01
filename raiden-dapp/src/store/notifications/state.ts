import { NotificationsState } from '@/store/notifications/types';

export const defaultState = (): NotificationsState => ({
  notifications: [],
  visibleNotification: null,
  newNotifications: false,
});

const state: NotificationsState = defaultState();

export default state;
