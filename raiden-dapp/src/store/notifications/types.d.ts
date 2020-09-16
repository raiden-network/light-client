import { NotificationImportance } from '@/store/notifications/notification-importance';
import { NotificationContext } from '@/store/notifications/notification-context';

export interface NotificationPayload {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly icon?: string;
  readonly importance: NotificationImportance;
  readonly context: NotificationContext;
  readonly duration: number;
  readonly received: Date;
  readonly txConfirmationBlock?: number;
  readonly txHash?: string;
  readonly txConfirmed?: boolean;
  display: boolean;
}

export interface NotificationsState {
  notifications: { [key: number]: NotificationPayload };
  newNotifications: boolean;
}
