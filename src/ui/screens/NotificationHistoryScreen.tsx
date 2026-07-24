import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  getAllNotificationHistory,
  type AllNotificationHistoryEntry,
} from '../../db/notification-log-repo';
import { getDb } from '../../db/schema';
import { useI18n } from '../../i18n';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationHistory'>;

export default function NotificationHistoryScreen({ navigation }: Props): React.JSX.Element {
  const { strings } = useI18n();
  const [entries, setEntries] = useState<AllNotificationHistoryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const db = await getDb();
    setEntries(await getAllNotificationHistory(db));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  const strategyLabel = (type: string): string => {
    if (type === 'grid') return strings.stockDetail.strategyNameGrid;
    if (type === 'pyramid') return strings.stockDetail.strategyNamePyramid;
    return type;
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={entries}
      keyExtractor={(entry) => String(entry.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{strings.notificationHistory.emptyTitle}</Text>
          <Text style={styles.emptySubtext}>{strings.notificationHistory.emptySubtitle}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('StockDetail', { watchlistId: item.watchlistId })}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.stockLabel}>
              {item.stockCode} {item.stockName}
            </Text>
            <Text style={styles.sentAt}>{item.sentAt}</Text>
          </View>
          <Text style={styles.strategyName}>{strategyLabel(item.strategyType)}</Text>
          <Text style={styles.signalKey}>{item.signalKey}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: spacing.xxxl,
  },
  emptyText: {
    ...typography.headline,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    ...typography.footnote,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockLabel: {
    ...typography.headline,
  },
  sentAt: {
    ...typography.caption,
    color: colors.secondaryLabel,
  },
  strategyName: {
    ...typography.subheadline,
    marginTop: spacing.xs,
  },
  signalKey: {
    ...typography.footnote,
    color: colors.secondaryLabel,
    marginTop: 2,
  },
});
