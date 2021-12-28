import type { RouteNames } from '@/router/route-names';
import type { NotificationContext } from '@/store/notifications/notification-context';
import type { NotificationImportance } from '@/store/notifications/notification-importance';

export interface NotificationPayload {
  readonly id: number;
  readonly icon?: string;
  readonly title: string;
  readonly description: string;
  readonly link?: string;
  readonly dappRoute?: RouteNames;
  readonly importance: NotificationImportance;
  readonly context: NotificationContext;
  readonly duration: number;
  readonly received: Date;
  readonly txConfirmationBlock?: number;
  readonly txHash?: string;
  display: boolean;
}

export type NotificationDictionary = { [key: number]: NotificationPayload };

export interface NotificationsState {
  notifications: NotificationDictionary;
  newNotifications: boolean;
}

export interface RootStateWithNotifications {
  notifications: NotificationsState;
}
