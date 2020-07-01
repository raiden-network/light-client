import { NotificationImportance } from '@/store/notifications/notification-importance';
import { NotificationContext } from '@/store/notifications/notification-context';

export interface NotificationPayload {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly display: boolean;
  readonly importance: NotificationImportance;
  readonly context: NotificationContext;
  readonly duration: number;
  readonly received: Date;
}

export interface NotificationsState {
  notifications: NotificationPayload[];
  newNotifications: boolean;
}
