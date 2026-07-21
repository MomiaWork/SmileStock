import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { backfillPriceHistory } from '../../data-fetch/price-history-sync';
import { getDb } from '../../db/schema';
import {
  addWatchlistItem,
  getAllStrategyConfigs,
  getWatchlistItem,
  replaceStrategyConfigs,
  updateWatchlistItem,
} from '../../db/watchlist-repo';
import type { GridStrategyConfig } from '../../strategy-engine/grid-strategy';
import type { MaCrossStrategyConfig } from '../../strategy-engine/ma-cross-strategy';
import type { RsiStrategyConfig } from '../../strategy-engine/rsi-strategy';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'WatchlistForm'>;

function toNumberOrUndefined(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

export default function WatchlistFormScreen({ route, navigation }: Props): React.JSX.Element {
  const watchlistId = route.params?.watchlistId;
  const isEditing = watchlistId !== undefined;

  const [stockCode, setStockCode] = useState('');
  const [stockName, setStockName] = useState('');
  const [budget, setBudget] = useState('10000');
  const [intervalSec, setIntervalSec] = useState('');

  const [gridEnabled, setGridEnabled] = useState(false);
  const [gridAnchorPrice, setGridAnchorPrice] = useState('');
  const [gridBudget, setGridBudget] = useState('');
  const [gridSpacingPercent, setGridSpacingPercent] = useState('5');
  const [gridTierCount, setGridTierCount] = useState('5');

  const [rsiEnabled, setRsiEnabled] = useState(false);
  const [rsiPeriod, setRsiPeriod] = useState('14');
  const [rsiThreshold, setRsiThreshold] = useState('30');

  const [maEnabled, setMaEnabled] = useState(false);
  const [maShortPeriod, setMaShortPeriod] = useState('5');
  const [maLongPeriod, setMaLongPeriod] = useState('20');

  const [loading, setLoading] = useState(isEditing);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? '編輯股票' : '新增股票' });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    void (async () => {
      const db = await getDb();
      const item = await getWatchlistItem(db, watchlistId);
      if (!item) {
        Alert.alert('找不到這筆股票');
        navigation.goBack();
        return;
      }
      setStockCode(item.stockCode);
      setStockName(item.stockName);
      setBudget(String(item.budget));
      setIntervalSec(item.priceCheckIntervalSec ? String(item.priceCheckIntervalSec) : '');
      if (!item.priceCheckIntervalSec) setGridBudget(String(item.budget));

      const configs = await getAllStrategyConfigs(db, watchlistId);
      for (const config of configs) {
        if (config.type === 'grid') {
          const p = config.params as GridStrategyConfig;
          setGridEnabled(config.enabled);
          setGridAnchorPrice(String(p.anchorPrice));
          setGridBudget(String(p.budget));
          setGridSpacingPercent(String(p.spacingPercent));
          setGridTierCount(String(p.tierCount));
        } else if (config.type === 'rsi') {
          const p = config.params as RsiStrategyConfig;
          setRsiEnabled(config.enabled);
          if (p.period !== undefined) setRsiPeriod(String(p.period));
          if (p.threshold !== undefined) setRsiThreshold(String(p.threshold));
        } else if (config.type === 'ma_cross') {
          const p = config.params as MaCrossStrategyConfig;
          setMaEnabled(config.enabled);
          if (p.shortPeriod !== undefined) setMaShortPeriod(String(p.shortPeriod));
          if (p.longPeriod !== undefined) setMaLongPeriod(String(p.longPeriod));
        }
      }
      setLoading(false);
    })();
  }, [isEditing, watchlistId, navigation]);

  const handleSave = async (): Promise<void> => {
    const budgetNum = Number(budget);
    if (
      stockCode.trim() === '' ||
      stockName.trim() === '' ||
      !Number.isFinite(budgetNum) ||
      budgetNum <= 0
    ) {
      Alert.alert('請確認股票代號、名稱、預算都已正確填寫');
      return;
    }

    const db = await getDb();
    const watchlistPayload = {
      stockCode: stockCode.trim(),
      stockName: stockName.trim(),
      budget: budgetNum,
      priceCheckIntervalSec: toNumberOrUndefined(intervalSec) ?? null,
    };

    try {
      const id = isEditing ? watchlistId : await addWatchlistItem(db, watchlistPayload);
      if (isEditing) {
        await updateWatchlistItem(db, watchlistId, watchlistPayload);
      } else {
        try {
          await backfillPriceHistory(db, watchlistPayload.stockCode);
        } catch (err) {
          // 回補歷史資料失敗不擋新增股票，之後每日同步仍會逐筆累積
          Alert.alert(
            '歷史資料回補失敗',
            `${err instanceof Error ? err.message : String(err)}\n\nRSI/均線策略要等資料累積足夠天數才會開始判斷，稍後可再手動同步。`,
          );
        }
      }

      const configs: { type: 'grid' | 'rsi' | 'ma_cross'; params: unknown; enabled: boolean }[] =
        [];
      if (gridEnabled) {
        configs.push({
          type: 'grid',
          enabled: true,
          params: {
            anchorPrice: Number(gridAnchorPrice),
            budget: Number(gridBudget || budget),
            spacingPercent: Number(gridSpacingPercent),
            tierCount: Number(gridTierCount),
          } satisfies GridStrategyConfig,
        });
      }
      if (rsiEnabled) {
        configs.push({
          type: 'rsi',
          enabled: true,
          params: {
            period: toNumberOrUndefined(rsiPeriod),
            threshold: toNumberOrUndefined(rsiThreshold),
          } satisfies RsiStrategyConfig,
        });
      }
      if (maEnabled) {
        configs.push({
          type: 'ma_cross',
          enabled: true,
          params: {
            shortPeriod: toNumberOrUndefined(maShortPeriod),
            longPeriod: toNumberOrUndefined(maLongPeriod),
          } satisfies MaCrossStrategyConfig,
        });
      }

      await replaceStrategyConfigs(db, id, configs);
      navigation.goBack();
    } catch (err) {
      Alert.alert('儲存失敗', err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>載入中...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>基本資料</Text>
      <TextInput
        style={styles.input}
        placeholder="股票代號，例如 2330"
        value={stockCode}
        onChangeText={setStockCode}
        autoCapitalize="characters"
      />
      <TextInput
        style={styles.input}
        placeholder="股票名稱，例如 台積電"
        value={stockName}
        onChangeText={setStockName}
      />
      <TextInput
        style={styles.input}
        placeholder="預算"
        value={budget}
        onChangeText={setBudget}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        placeholder="查價間隔秒數（留空使用全域預設）"
        value={intervalSec}
        onChangeText={setIntervalSec}
        keyboardType="numeric"
      />

      <View style={styles.switchRow}>
        <Text style={styles.sectionTitle}>微笑曲線網格</Text>
        <Switch value={gridEnabled} onValueChange={setGridEnabled} />
      </View>
      {gridEnabled && (
        <View>
          <TextInput
            style={styles.input}
            placeholder="錨定價"
            value={gridAnchorPrice}
            onChangeText={setGridAnchorPrice}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.input}
            placeholder="網格預算"
            value={gridBudget}
            onChangeText={setGridBudget}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.input}
            placeholder="間距 %"
            value={gridSpacingPercent}
            onChangeText={setGridSpacingPercent}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.input}
            placeholder="檔位數"
            value={gridTierCount}
            onChangeText={setGridTierCount}
            keyboardType="numeric"
          />
        </View>
      )}

      <View style={styles.switchRow}>
        <Text style={styles.sectionTitle}>RSI</Text>
        <Switch value={rsiEnabled} onValueChange={setRsiEnabled} />
      </View>
      {rsiEnabled && (
        <View>
          <TextInput
            style={styles.input}
            placeholder="天數（預設 14）"
            value={rsiPeriod}
            onChangeText={setRsiPeriod}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.input}
            placeholder="門檻（預設 30）"
            value={rsiThreshold}
            onChangeText={setRsiThreshold}
            keyboardType="numeric"
          />
        </View>
      )}

      <View style={styles.switchRow}>
        <Text style={styles.sectionTitle}>均線交叉</Text>
        <Switch value={maEnabled} onValueChange={setMaEnabled} />
      </View>
      {maEnabled && (
        <View>
          <TextInput
            style={styles.input}
            placeholder="短均線天數（預設 5）"
            value={maShortPeriod}
            onChangeText={setMaShortPeriod}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.input}
            placeholder="長均線天數（預設 20）"
            value={maLongPeriod}
            onChangeText={setMaLongPeriod}
            keyboardType="numeric"
          />
        </View>
      )}

      <View style={styles.saveButton}>
        <Button title="儲存" onPress={handleSave} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 16,
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saveButton: {
    marginTop: 24,
    marginBottom: 40,
  },
});
