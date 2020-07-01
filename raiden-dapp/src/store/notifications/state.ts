import { NotificationsState } from '@/store/notifications/types';

export const defaultState = (): NotificationsState => ({
  notifications: [],
  newNotifications: false,
});

const state: NotificationsState = defaultState();

export default state;
