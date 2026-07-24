import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getLastBackgroundRunInfo } from '../../background/background-fetch-task';
import { getDb } from '../../db/schema';
import {
  DEFAULT_CLAUDE_SHORTCUT_NAME,
  DEFAULT_GLOBAL_INTERVAL_SEC,
  DEFAULT_MAX_WATCHLIST_SIZE,
  getClaudeShortcutName,
  getGlobalDefaultIntervalSec,
  getMaxWatchlistSize,
  setClaudeShortcutName,
  setGlobalDefaultIntervalSec,
  setMaxWatchlistSize,
} from '../../db/settings-repo';
import { SUPPORTED_LANGUAGES, useI18n, type LanguagePreference } from '../../i18n';
import { requestNotificationPermission } from '../../notifications/local-notification';
import PrimaryButton from '../components/PrimaryButton';
import { InputRow, Row } from '../components/Row';
import Section from '../components/Section';
import { colors, spacing, typography } from '../theme';

const LANGUAGE_PREFERENCE_OPTIONS: LanguagePreference[] = ['system', ...SUPPORTED_LANGUAGES];

export default function SettingsScreen(): React.JSX.Element {
  const { strings, preference, setPreference } = useI18n();
  const [intervalSec, setIntervalSec] = useState(String(DEFAULT_GLOBAL_INTERVAL_SEC));
  const [shortcutName, setShortcutName] = useState(DEFAULT_CLAUDE_SHORTCUT_NAME);
  const [maxWatchlistSize, setMaxWatchlistSizeInput] = useState(
    String(DEFAULT_MAX_WATCHLIST_SIZE),
  );
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);

  const reload = useCallback(async () => {
    const db = await getDb();
    setIntervalSec(String(await getGlobalDefaultIntervalSec(db)));
    setShortcutName(await getClaudeShortcutName(db));
    setMaxWatchlistSizeInput(String(await getMaxWatchlistSize(db)));

    const permissions = await Notifications.getPermissionsAsync();
    setPermissionGranted(permissions.granted);

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
    const parsedMaxWatchlistSize = Number(maxWatchlistSize);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    if (!Number.isInteger(parsedMaxWatchlistSize) || parsedMaxWatchlistSize <= 0) {
      return;
    }
    setSaving(true);
    try {
      const db = await getDb();
      await setGlobalDefaultIntervalSec(db, parsed);
      await setClaudeShortcutName(db, shortcutName);
      await setMaxWatchlistSize(db, parsedMaxWatchlistSize);
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

  const permissionLabel =
    permissionGranted === null
      ? strings.common.unknown
      : permissionGranted
        ? strings.settings.granted
        : strings.settings.denied;

  const languagePreferenceLabel = (pref: LanguagePreference): string => {
    if (pref === 'system') return strings.settings.languageSystem;
    if (pref === 'zh') return strings.settings.languageZh;
    return strings.settings.languageEn;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section
        title={strings.settings.sectionGlobalDefaults}
        footer={strings.settings.sectionGlobalDefaultsFooter}
      >
        <InputRow
          label={strings.settings.fieldIntervalSec}
          value={intervalSec}
          onChangeText={setIntervalSec}
          keyboardType="numeric"
        />
        <InputRow
          label={strings.settings.fieldClaudeShortcutName}
          value={shortcutName}
          onChangeText={setShortcutName}
        />
        <InputRow
          label={strings.settings.fieldMaxWatchlistSize}
          value={maxWatchlistSize}
          onChangeText={setMaxWatchlistSizeInput}
          keyboardType="numeric"
        />
      </Section>
      <View style={styles.saveButtonWrap}>
        <PrimaryButton title={strings.common.save} onPress={() => void handleSave()} loading={saving} />
        {saved && <Text style={styles.savedText}>{strings.settings.saved}</Text>}
      </View>
      <Text style={styles.footnote}>{strings.settings.claudeShortcutFootnote}</Text>

      <Section title={strings.settings.sectionLanguage}>
        {LANGUAGE_PREFERENCE_OPTIONS.map((pref) => (
          <Row key={pref} label={languagePreferenceLabel(pref)} onPress={() => setPreference(pref)}>
            {preference === pref && <Ionicons name="checkmark" size={18} color={colors.tint} />}
          </Row>
        ))}
      </Section>

      <Section title={strings.settings.sectionNotificationPermission}>
        <Row label={strings.settings.currentStatus}>
          <Text
            style={[styles.value, permissionGranted ? styles.valuePositive : styles.valueNeutral]}
          >
            {permissionLabel}
          </Text>
        </Row>
      </Section>
      <View style={styles.saveButtonWrap}>
        <PrimaryButton
          title={strings.settings.requestPermission}
          onPress={() => void handleRequestPermission()}
          loading={requestingPermission}
        />
      </View>

      <Section
        title={strings.settings.sectionBackgroundTask}
        footer={strings.settings.sectionBackgroundTaskFooter}
      >
        <Row label={strings.settings.lastRunTime}>
          <Text style={styles.value}>{lastRunAt ?? strings.settings.neverRun}</Text>
        </Row>
        <Row label={strings.settings.lastRunResult}>
          <Text style={styles.value}>{lastResult ?? strings.common.none}</Text>
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
