import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

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
import PrimaryButton from '../components/PrimaryButton';
import { InputRow, Row } from '../components/Row';
import Section from '../components/Section';
import { colors, spacing, typography } from '../theme';

export default function SettingsScreen(): React.JSX.Element {
  const [intervalSec, setIntervalSec] = useState(String(DEFAULT_GLOBAL_INTERVAL_SEC));
  const [shortcutName, setShortcutName] = useState(DEFAULT_CLAUDE_SHORTCUT_NAME);
  const [permissionStatus, setPermissionStatus] = useState<string>('未知');
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);

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
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    setSaving(true);
    try {
      const db = await getDb();
      await setGlobalDefaultIntervalSec(db, parsed);
      await setClaudeShortcutName(db, shortcutName);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleRequestPermission = async (): Promise<void> => {
    setRequestingPermission(true);
    try {
      await requestNotificationPermission();
      await reload();
    } finally {
      setRequestingPermission(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="全域預設" footer="個別股票若沒有自訂查價間隔，App 開著時的前景輪詢就會用這個值。">
        <InputRow
          label="查價間隔（秒）"
          value={intervalSec}
          onChangeText={setIntervalSec}
          keyboardType="numeric"
        />
        <InputRow
          label="Claude 捷徑名稱"
          value={shortcutName}
          onChangeText={setShortcutName}
        />
      </Section>
      <View style={styles.saveButtonWrap}>
        <PrimaryButton title="儲存" onPress={() => void handleSave()} loading={saving} />
        {saved && <Text style={styles.savedText}>已儲存</Text>}
      </View>
      <Text style={styles.footnote}>
        首頁「Claude 分析」按鈕會直接執行這個名稱的 iOS 捷徑，名稱必須與捷徑 App
        內的完全一致。捷徑設定方式見 docs/ios-shortcuts-setup.md。
      </Text>

      <Section title="通知權限">
        <Row label="目前狀態">
          <Text
            style={[
              styles.value,
              permissionStatus === '已授權' ? styles.valuePositive : styles.valueNeutral,
            ]}
          >
            {permissionStatus}
          </Text>
        </Row>
      </Section>
      <View style={styles.saveButtonWrap}>
        <PrimaryButton
          title="要求通知權限"
          onPress={() => void handleRequestPermission()}
          loading={requestingPermission}
        />
      </View>

      <Section
        title="背景任務"
        footer="背景執行為 best-effort，實際觸發頻率由系統決定，App 開著時請以前景輪詢為主。"
      >
        <Row label="上次背景執行時間">
          <Text style={styles.value}>{lastRunAt ?? '尚未執行過'}</Text>
        </Row>
        <Row label="上次結果">
          <Text style={styles.value}>{lastResult ?? '無'}</Text>
        </Row>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  saveButtonWrap: {
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  savedText: {
    ...typography.footnote,
    color: colors.profit,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  footnote: {
    ...typography.footnote,
    marginBottom: spacing.lg,
    marginHorizontal: spacing.xs,
  },
  value: {
    ...typography.body,
  },
  valuePositive: {
    color: colors.profit,
  },
  valueNeutral: {
    color: colors.secondaryLabel,
  },
});
