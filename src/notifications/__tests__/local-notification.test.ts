/* eslint-disable import/first -- jest.mock calls must precede the imports they mock */
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));
jest.mock('../../db/notification-log-repo');

import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { hasBeenNotified, recordNotification } from '../../db/notification-log-repo';
import { notifyIfNew, requestNotificationPermission } from '../local-notification';

const fakeDb = {} as SQLiteDatabase;
const mockHasBeenNotified = hasBeenNotified as jest.Mock;
const mockRecordNotification = recordNotification as jest.Mock;
const mockScheduleNotificationAsync = Notifications.scheduleNotificationAsync as jest.Mock;
const mockGetPermissionsAsync = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissionsAsync = Notifications.requestPermissionsAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('notifyIfNew', () => {
  test('同一個 signal_key 已經發過時，不會再發一次', async () => {
    mockHasBeenNotified.mockResolvedValue(true);

    const notified = await notifyIfNew(fakeDb, {
      watchlistId: 1,
      strategyConfigId: 10,
      signalKey: 'grid:tier2:2026-07-20',
      title: 'title',
      body: 'body',
    });

    expect(notified).toBe(false);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockRecordNotification).not.toHaveBeenCalled();
  });

  test('新的 signal_key 會發送通知並寫入 notification_log', async () => {
    mockHasBeenNotified.mockResolvedValue(false);

    const notified = await notifyIfNew(fakeDb, {
      watchlistId: 1,
      strategyConfigId: 10,
      signalKey: 'grid:tier2:2026-07-20',
      title: 'title',
      body: 'body',
    });

    expect(notified).toBe(true);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockRecordNotification).toHaveBeenCalledWith(fakeDb, 1, 10, 'grid:tier2:2026-07-20');
  });
});

describe('requestNotificationPermission', () => {
  test('已經有權限時不會再跳一次要求', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: true });

    const granted = await requestNotificationPermission();

    expect(granted).toBe(true);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  test('尚未授權時會發出要求', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });

    const granted = await requestNotificationPermission();

    expect(granted).toBe(true);
    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});
