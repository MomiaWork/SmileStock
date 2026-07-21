import * as BackgroundTask from 'expo-background-task';
import { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  getBackgroundTaskStatusAsync,
  getLastBackgroundRunInfo,
  registerBackgroundTaskAsync,
  unregisterBackgroundTaskAsync,
} from '../../background/background-fetch-task';
import {
  isForegroundPollRunning,
  startForegroundPoll,
  stopForegroundPoll,
} from '../../background/foreground-poll';
import { getDb } from '../../db/schema';
import { syncPriceHistory } from '../../data-fetch/price-history-sync';
import { requestNotificationPermission } from '../../notifications/local-notification';
import { checkWatchlistAndNotify } from '../../notifications/run-check';
import { getWatchlist } from '../../db/watchlist-repo';
import { seedTestData } from './dev-seed-data';

/**
 * Phase 4 手動驗證用畫面。背景任務的實際觸發頻率完全由系統決定（best-effort，
 * 不保證），只能在實機上長時間觀察才能確認，模擬器行為不準。
 * Phase 5 會用正式設定頁取代這個畫面。
 */
export default function DevBackgroundScreen(): React.JSX.Element {
  const [status, setStatus] = useState<string>('');
  const [pollRunning, setPollRunning] = useState(isForegroundPollRunning());
  const [log, setLog] = useState<string>('');

  const refreshStatus = async (): Promise<void> => {
    const [taskStatus, lastRun] = await Promise.all([
      getBackgroundTaskStatusAsync(),
      getLastBackgroundRunInfo(),
    ]);
    const statusLabel =
      taskStatus === BackgroundTask.BackgroundTaskStatus.Available ? 'Available' : 'Restricted';
    setStatus(
      `背景任務狀態：${statusLabel}\n上次背景執行時間：${lastRun.lastRunAt ?? '尚未執行過'}\n上次結果：${lastRun.lastResult ?? '無'}`,
    );
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 掛載時載入初始狀態，非同步展示用畫面沒有更輕量的替代寫法
    void refreshStatus();
  }, []);

  const handleSeed = async (): Promise<void> => {
    const db = await getDb();
    await seedTestData(db);
    setLog('測試資料已建立（或已存在）');
  };

  const handleRegister = async (): Promise<void> => {
    await requestNotificationPermission();
    await registerBackgroundTaskAsync();
    await refreshStatus();
    setLog('已嘗試向系統註冊背景任務（是否、何時真的被系統呼叫由系統決定）');
  };

  const handleUnregister = async (): Promise<void> => {
    await unregisterBackgroundTaskAsync();
    await refreshStatus();
    setLog('已取消註冊背景任務');
  };

  const handleToggleForegroundPoll = (): void => {
    if (pollRunning) {
      stopForegroundPoll();
      setPollRunning(false);
      setLog('已停止前景輪詢');
    } else {
      startForegroundPoll();
      setPollRunning(true);
      setLog('已開始前景輪詢（依每檔股票設定的查價間隔，App 進背景後會停止）');
    }
  };

  const handleManualUpdate = async (): Promise<void> => {
    setLog('手動立即更新中...');
    const db = await getDb();
    const watchlist = await getWatchlist(db);
    const codes = watchlist.map((item) => item.stockCode);
    if (codes.length > 0) {
      await syncPriceHistory(db, codes);
    }
    const results = await checkWatchlistAndNotify(db);
    await refreshStatus();

    const lines = [`手動更新完成，檢查了 ${results.length} 個策略設定：`, ''];
    for (const r of results) {
      lines.push(
        `${r.stockCode} ${r.stockName} [${r.strategyType}] triggered=${r.signal.triggered} notified=${r.notified}`,
      );
      lines.push(`  reason: ${r.signal.reason}`);
    }
    setLog(lines.join('\n'));
  };

  const handleDevTrigger = async (): Promise<void> => {
    try {
      const triggered = await BackgroundTask.triggerTaskWorkerForTestingAsync();
      await refreshStatus();
      setLog(`已呼叫 triggerTaskWorkerForTestingAsync()，結果：${triggered}（僅 dev build 有效）`);
    } catch (err) {
      setLog(
        `triggerTaskWorkerForTestingAsync 失敗：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Phase 4 測試：背景任務</Text>
      <Text style={styles.status}>{status}</Text>

      <Button title="0. 建立測試資料" onPress={handleSeed} />
      <View style={styles.spacer} />
      <Button title="嘗試註冊背景任務" onPress={handleRegister} />
      <View style={styles.spacer} />
      <Button title="取消註冊" onPress={handleUnregister} />
      <View style={styles.spacer} />
      <Button
        title={pollRunning ? '停止前景輪詢' : '開始前景輪詢'}
        onPress={handleToggleForegroundPoll}
      />
      <View style={styles.spacer} />
      <Button title="手動立即更新" onPress={handleManualUpdate} />
      <View style={styles.spacer} />
      <Button title="[dev] 手動觸發背景任務" onPress={handleDevTrigger} />

      <ScrollView style={styles.logBox}>
        <Text style={styles.logText}>{log}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  status: {
    fontSize: 13,
    color: '#333',
    marginBottom: 16,
  },
  spacer: {
    height: 8,
  },
  logBox: {
    marginTop: 16,
    flex: 1,
  },
  logText: {
    fontFamily: 'Courier',
    fontSize: 12,
  },
});
