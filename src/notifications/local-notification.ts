import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { hasBeenNotified, recordNotification } from '../db/notification-log-repo';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export interface NotifyIfNewParams {
  watchlistId: number;
  strategyConfigId: number;
  signalKey: string;
  title: string;
  body: string;
}

/**
 * 發送前先查 notification_log，同一個 (watchlist_id, strategy_config_id, signal_key)
 * 已經發過就不會再發一次。回傳這次是否真的送出了通知。
 */
export async function notifyIfNew(db: SQLiteDatabase, params: NotifyIfNewParams): Promise<boolean> {
  const alreadyNotified = await hasBeenNotified(
    db,
    params.watchlistId,
    params.strategyConfigId,
    params.signalKey,
  );
  if (alreadyNotified) {
    return false;
  }

  await Notifications.scheduleNotificationAsync({
    content: { title: params.title, body: params.body },
    trigger: null,
  });
  await recordNotification(db, params.watchlistId, params.strategyConfigId, params.signalKey);
  return true;
}
