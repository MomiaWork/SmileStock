import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useCallback, useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { getLastBackgroundRunInfo } from '../../background/background-fetch-task';
import { getDb } from '../../db/schema';
import {
  DEFAULT_CLAUDE_SHORTCUT_NAME,
  DEFAULT_GLOBAL_INTERVAL_SEC,
  getClaudeShortcutName,
  getGlobalDefaultIntervalSec,
  setClaudeShortcutName,
  setGlobalDefaultIntervalSec,
} from '../../db/settings-repo';
import { requestNotificationPermission } from '../../notifications/local-notification';

export default function SettingsScreen(): React.JSX.Element {
  const [intervalSec, setIntervalSec] = useState(String(DEFAULT_GLOBAL_INTERVAL_SEC));
  const [shortcutName, setShortcutName] = useState(DEFAULT_CLAUDE_SHORTCUT_NAME);
  const [permissionStatus, setPermissionStatus] = useState<string>('未知');
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const reload = useCallback(async () => {
    const db = await getDb();
    setIntervalSec(String(await getGlobalDefaultIntervalSec(db)));
    setShortcutName(await getClaudeShortcutName(db));

    const permissions = await Notifications.getPermissionsAsync();
    setPermissionStatus(permissions.granted ? '已授權' : '未授權');

    const info = await getLastBackgroundRunInfo();
    setLastRunAt(info.lastRunAt);
    setLastResult(info.lastResult);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
      setSaved(false);
    }, [reload]),
  );

  const handleSave = async (): Promise<void> => {
    const parsed = Number(intervalSec);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const db = await getDb();
    await setGlobalDefaultIntervalSec(db, parsed);
    await setClaudeShortcutName(db, shortcutName);
    setSaved(true);
  };

  const handleRequestPermission = async (): Promise<void> => {
    await requestNotificationPermission();
    await reload();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>全域預設查價間隔（秒）</Text>
      <TextInput
        style={styles.input}
        value={intervalSec}
        onChangeText={setIntervalSec}
        keyboardType="numeric"
      />
      <Text style={styles.hint}>
        個別股票若沒有自訂查價間隔，App 開著時的前景輪詢就會用這個值。
      </Text>
      <Text style={styles.sectionTitle}>Claude 分析捷徑名稱</Text>
      <TextInput style={styles.input} value={shortcutName} onChangeText={setShortcutName} />
      <Text style={styles.hint}>
        首頁「Claude 分析」按鈕會直接執行這個名稱的 iOS 捷徑，名稱必須與捷徑 App
        內的完全一致。捷徑設定方式見 docs/ios-shortcuts-setup.md。
      </Text>

      <Button title="儲存" onPress={handleSave} />
      {saved && <Text style={styles.savedText}>已儲存</Text>}

      <Text style={styles.sectionTitle}>通知權限</Text>
      <Text style={styles.value}>{permissionStatus}</Text>
      <Button title="要求通知權限" onPress={handleRequestPermission} />

      <Text style={styles.sectionTitle}>背景任務</Text>
      <Text style={styles.hint}>
        背景執行為 best-effort，實際觸發頻率由系統決定，App 開著時請以前景輪詢為主。
      </Text>
      <Text style={styles.value}>上次背景執行時間：{lastRunAt ?? '尚未執行過'}</Text>
      <Text style={styles.value}>上次結果：{lastResult ?? '無'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  value: {
    fontSize: 13,
    color: '#333',
    marginBottom: 4,
  },
  savedText: {
    color: 'green',
    fontSize: 12,
    marginTop: 4,
  },
});
