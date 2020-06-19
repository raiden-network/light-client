export interface Notification {
  id: number;
  title: string;
  description: string;
  received: Date;
}

export interface NotificationsState {
  notifications: Notification[];
  newNotifications: boolean;
}
