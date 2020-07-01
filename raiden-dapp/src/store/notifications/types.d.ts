export interface Notification {
  id: number;
  title: string;
  description: string;
  received: Date;
}

export interface NotificationsState {
  notifications: Notification[];
  visibleNotification: Notification | null;
  newNotifications: boolean;
}
