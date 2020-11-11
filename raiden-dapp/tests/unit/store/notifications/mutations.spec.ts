import { generateNotificationPayload } from '../../utils/data-generator';
import { mutations } from '@/store/notifications/mutations';
import { NotificationsState } from '@/store/notifications/types';
import { NotificationContext } from '@/store/notifications/notification-context';
import { NotificationImportance } from '@/store/notifications/notification-importance';

const notificationIdentifier = 1;
const notificationPayload = generateNotificationPayload();

function createNotificationState(
  newNotifications = false,
  baseNotificationPayload = notificationPayload,
): NotificationsState {
  return {
    notifications: {
      [notificationIdentifier]: {
        ...baseNotificationPayload,
        id: notificationIdentifier,
        display: true,
      },
    },
    newNotifications,
  };
}

describe('notifications store mutations', () => {
  test('can delete notification', () => {
    const state = createNotificationState();

    mutations.notificationDelete(state, notificationIdentifier);

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
    const newNotificationPayload = generateNotificationPayload();

    expect(Object.keys(state.notifications).length).toBe(1);

    mutations.notificationAddOrReplace(state, newNotificationPayload);

    expect(Object.keys(state.notifications).length).toBe(2);
    expect(state.notifications).toMatchObject({ 1: { id: 1 }, 2: { id: 2 } });
  });

  test('can add new notifications which gets received date set automatically', () => {
    const state = createNotificationState();
    const newNotificationPayload = generateNotificationPayload();

    expect(newNotificationPayload.received).toBeUndefined();

    mutations.notificationAddOrReplace(state, newNotificationPayload);

    const addedNotification = state.notifications[2];
    expect(addedNotification.received).not.toBeUndefined();
  });

  test('can add new notification with automatic defaults', () => {
    const state = createNotificationState();
    const newNotificationPayload = generateNotificationPayload();

    expect(newNotificationPayload.context).toBeUndefined();
    expect(newNotificationPayload.importance).toBeUndefined();
    expect(newNotificationPayload.duration).toBeUndefined();

    mutations.notificationAddOrReplace(state, newNotificationPayload);

    const addedNotification = state.notifications[2];
    expect(addedNotification.context).toBe(NotificationContext.NONE);
    expect(addedNotification.importance).toBe(NotificationImportance.LOW);
    expect(addedNotification.duration).toBe(5000);
  });

  test('can add new notification with overwritten defaults', () => {
    const state = createNotificationState();
    const newNotificationPayload = generateNotificationPayload({
      context: NotificationContext.INFO,
      importance: NotificationImportance.HIGH,
      duration: 100000,
    });

    mutations.notificationAddOrReplace(state, newNotificationPayload);

    const addedNotification = state.notifications[2];
    expect(addedNotification.context).toBe(NotificationContext.INFO);
    expect(addedNotification.importance).toBe(NotificationImportance.HIGH);
    expect(addedNotification.duration).toBe(100000);
  });

  test('can update notification with same transaction hash', () => {
    const txHash = 'txHash';
    const notificationPayloadWithTxHash = { ...notificationPayload, txHash };
    const state = createNotificationState(undefined, notificationPayloadWithTxHash);

    expect(Object.keys(state.notifications).length).toBe(1);
    expect(state.notifications[notificationIdentifier].display).toBe(true);
    expect(state.notifications[notificationIdentifier].title).toBe(
      notificationPayloadWithTxHash.title,
    );

    const updatedNotificationPayload = { ...notificationPayloadWithTxHash, title: 'New Title' };
    mutations.notificationAddOrReplace(state, updatedNotificationPayload);

    expect(Object.keys(state.notifications).length).toBe(1);
    expect(state.notifications[notificationIdentifier].display).toBe(false);
    expect(state.notifications[notificationIdentifier].title).toBe('New Title');
  });

  test('can clear all notifications', () => {
    const state = createNotificationState();

    expect(Object.keys(state.notifications).length).toBe(1);

    mutations.clear(state);

    expect(Object.keys(state.notifications).length).toBe(0);
  });
});
