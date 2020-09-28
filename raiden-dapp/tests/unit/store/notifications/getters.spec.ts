import { getters } from '@/store/notifications/getters';
import { TestData } from '../../data/mock-data';
import { NotificationsState } from '@/store/notifications/types';

describe('notifications store getters', () => {
  const notification = TestData.notifications;
  const notificationState: NotificationsState = {
    notifications: {
      1: { ...notification, id: 29 },
      2: { ...notification, id: 10 },
      3: { ...notification, id: 22 },
    },
    newNotifications: false,
  };

  test('can get all notifications sorted by newest first', () => {
    const allNotifications = getters.notifications(notificationState);
    const notificationIds = allNotifications.map(
      (notification) => notification.id
    );

    expect(notificationIds).toEqual(expect.arrayContaining([29, 22, 10]));
  });

  test('next notification id increments current highest id', () => {
    const currentHighestId = Math.max(
      ...Object.values(notificationState.notifications).map(
        (notification) => notification.id
      )
    );
    expect(currentHighestId).toBe(29);

    const newNotificationId = getters.nextNotificationId(notificationState);
    expect(newNotificationId).toBe(30);
  });
});
