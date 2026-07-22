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
  // 從「策略建議」畫面帶參數過來時預填——只在新增（非編輯）情境套用，
  // 錨定價留給使用者自己填當下價格，不從建議帶入（建議是用回測區間第一天的價格算的，
  // 跟使用者現在要新增股票的當下價格無關）
  const prefill = isEditing ? undefined : route.params?.prefill;

  const [stockCode, setStockCode] = useState(prefill?.stockCode ?? '');
  const [stockName, setStockName] = useState('');
  const [budget, setBudget] = useState('10000');
  const [intervalSec, setIntervalSec] = useState('');
  const [takeProfitPercent, setTakeProfitPercent] = useState(
    prefill ? String(prefill.takeProfitPercent) : '',
  );
  const [stopLossPercent, setStopLossPercent] = useState(
    prefill ? String(prefill.stopLossPercent) : '',
  );

  const [gridEnabled, setGridEnabled] = useState(prefill !== undefined);
  const [gridAnchorPrice, setGridAnchorPrice] = useState('');
  const [gridBudget, setGridBudget] = useState('');
  const [gridSpacingPercent, setGridSpacingPercent] = useState(
    prefill ? String(prefill.spacingPercent) : '5',
  );
  const [gridTierCount, setGridTierCount] = useState(prefill ? String(prefill.tierCount) : '5');

  const [entryConfirmEnabled, setEntryConfirmEnabled] = useState(
    prefill?.entryConfirmEnabled ?? false,
  );

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
      if (item.takeProfitPercent !== null) setTakeProfitPercent(String(item.takeProfitPercent));
      if (item.stopLossPercent !== null) setStopLossPercent(String(item.stopLossPercent));
      setEntryConfirmEnabled(item.entryConfirmEnabled);

      const configs = await getAllStrategyConfigs(db, watchlistId);
      for (const config of configs) {
        if (config.type === 'grid') {
          const p = config.params as GridStrategyConfig;
          setGridEnabled(config.enabled);
          setGridAnchorPrice(String(p.anchorPrice));
          setGridBudget(String(p.budget));
          setGridSpacingPercent(String(p.spacingPercent));
          setGridTierCount(String(p.tierCount));
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
      takeProfitPercent: toNumberOrUndefined(takeProfitPercent) ?? null,
      stopLossPercent: toNumberOrUndefined(stopLossPercent) ?? null,
      entryConfirmEnabled,
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
            `${err instanceof Error ? err.message : String(err)}\n\n進場確認濾網要等資料累積足夠天數才會開始判斷，稍後可再手動同步。`,
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

      <Text style={styles.sectionTitle}>出場設定</Text>
      <Text style={styles.helperText}>
        持有部位時用來判斷是否建議出場，留空使用預設值（停利 10%／停損 8%）
      </Text>
      <TextInput
        style={styles.input}
        placeholder="停利 %（留空預設 10）"
        value={takeProfitPercent}
        onChangeText={setTakeProfitPercent}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        placeholder="停損 %（留空預設 8）"
        value={stopLossPercent}
        onChangeText={setStopLossPercent}
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
        <Text style={styles.sectionTitle}>進場確認濾網</Text>
        <Switch value={entryConfirmEnabled} onValueChange={setEntryConfirmEnabled} />
      </View>
      <Text style={styles.helperText}>
        開啟後，網格觸發時除了看趨勢是否止穩，還會多確認一次近期動能是否轉強，
        兩項都通過才建議進場，未通過先建議觀望。
      </Text>

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
  helperText: {
    fontSize: 12,
    color: '#888',
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
