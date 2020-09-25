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

    expect(allNotifications[0]).toMatchObject({ id: 29 });
    expect(allNotifications[1]).toMatchObject({ id: 22 });
    expect(allNotifications[2]).toMatchObject({ id: 10 });
  });

  test('next notification id increments current highest id', () => {
    const newNotificationId = getters.nextNotificationId(notificationState);

    expect(newNotificationId).toBe(30);
  });
});
