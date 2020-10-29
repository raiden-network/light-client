import { NotificationImportance } from '@/store/notifications/notification-importance';
import { NotificationContext } from '@/store/notifications/notification-context';

export interface NotificationPayload {
  readonly id: number;
  readonly icon?: string;
  readonly title: string;
  readonly description: string;
  readonly link?: string;
  readonly dappRoute?: string;
  readonly importance: NotificationImportance;
  readonly context: NotificationContext;
  readonly duration: number;
  readonly received: Date;
  readonly txConfirmationBlock?: number;
  readonly txHash?: string;
  readonly txConfirmed?: boolean;
  display: boolean;
}

export type NotificationDictionary = { [key: number]: NotificationPayload };

export interface NotificationsState {
  notifications: NotificationDictionary;
  newNotifications: boolean;
}
