import { TestData } from '../../data/mock-data';
import { mutations } from '@/store/notifications/mutations';
import { NotificationPayload, NotificationsState } from '@/store/notifications/types';

describe('notifications store mutations', () => {
  const notification = TestData.notifications;

  const createNotificationState = (newNotifications = false): NotificationsState => {
    return {
      notifications: { 1: notification },
      newNotifications,
    };
  };

  test('can delete notification', () => {
    const state = createNotificationState();
    const id = notification.id;

    mutations.notificationDelete(state, id);
    expect(state.notifications).toMatchObject({});
  });

  test('can set notifications to viewed', () => {
    const state = createNotificationState(true);
    expect(state.newNotifications).toBe(true);

    mutations.notificationsViewed(state);
    expect(state.newNotifications).toBe(false);
  });

  test('can add new notifications', () => {
    const state = createNotificationState();
    const newNotification: NotificationPayload = {
      ...notification,
      txHash: '0xNewTxHash',
    };

    mutations.notificationAddOrReplace(state, newNotification);
    expect(Object.keys(state.notifications).length).toBe(2);
    expect(state.notifications).toMatchObject({ 1: { id: 1 }, 2: { id: 2 } });
  });

  test('can update notifications', () => {
    const state = createNotificationState();
    const updatedNotification: NotificationPayload = {
      ...notification,
      txConfirmationBlock: 1234,
    };

    mutations.notificationAddOrReplace(state, notification);
    expect(state.notifications).toMatchObject({
      1: { txConfirmationBlock: 123 },
    });

    mutations.notificationAddOrReplace(state, updatedNotification);
    expect(state.notifications).toMatchObject({
      1: { txConfirmationBlock: 1234 },
    });
  });
});
