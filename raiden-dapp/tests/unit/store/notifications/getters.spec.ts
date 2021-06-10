import { getters } from '@/store/notifications/getters';
import { NotificationImportance } from '@/store/notifications/notification-importance';
import type { NotificationsState } from '@/store/notifications/types';

import { TestData } from '../../data/mock-data';

describe('notifications store getters', () => {
  const notification = TestData.notifications;
  const notificationState: NotificationsState = {
    notifications: {
      29: { ...notification, id: 29, display: true, importance: NotificationImportance.HIGH },
      10: { ...notification, id: 10, display: false },
      22: { ...notification, id: 22, display: true, importance: NotificationImportance.HIGH },
      23: { ...notification, id: 23, display: true, importance: NotificationImportance.LOW },
    },
    newNotifications: false,
  };

  test('can get all notifications sorted by newest first', () => {
    const allNotifications = getters.notifications(notificationState);
    const notificationIds = allNotifications.map((notification) => notification.id);

    expect(notificationIds).toEqual(expect.arrayContaining([29, 22, 23, 10]));
  });

  test('notification queue only includes notifications with the display tag', () => {
    const notificationQueue = getters.notificationQueue(notificationState);

    for (const notification of notificationQueue) {
      expect(notification.display).toBeTruthy();
    }
  });

  test('notification queue only includes important notifications', () => {
    const notificationQueue = getters.notificationQueue(notificationState);

    for (const notification of notificationQueue) {
      expect(notification.importance).toBe(NotificationImportance.HIGH);
    }
  });

  test('notification queue is sorted by newest first', () => {
    const notificationQueue = getters.notificationQueue(notificationState);
    const notificationIds = notificationQueue.map((notification) => notification.id);

    expect(notificationIds).toEqual(expect.arrayContaining([22, 29]));
  });
});
