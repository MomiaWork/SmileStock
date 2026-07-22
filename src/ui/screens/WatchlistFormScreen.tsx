import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { backfillPriceHistory } from '../../data-fetch/price-history-sync';
import { fetchRealtimeQuotes } from '../../data-fetch/twse-client';
import { getDb } from '../../db/schema';
import { DEFAULT_GLOBAL_INTERVAL_SEC, getGlobalDefaultIntervalSec } from '../../db/settings-repo';
import {
  addWatchlistItem,
  getAllStrategyConfigs,
  getWatchlistItem,
  replaceStrategyConfigs,
  updateWatchlistItem,
} from '../../db/watchlist-repo';
import type { GridStrategyConfig } from '../../strategy-engine/grid-strategy';
import { InputRow, Row } from '../components/Row';
import Section from '../components/Section';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme';

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
  // 跟使用者現在要新增股票的當下價格無關，會用即時報價另外自動帶入）
  const prefill = isEditing ? undefined : route.params?.prefill;

  const [stockCode, setStockCode] = useState(prefill?.stockCode ?? '');
  const [stockName, setStockName] = useState(prefill?.stockName ?? '');
  const [budget, setBudget] = useState('100000');
  const [intervalSec, setIntervalSec] = useState(String(DEFAULT_GLOBAL_INTERVAL_SEC));
  const [takeProfitPercent, setTakeProfitPercent] = useState(
    prefill ? String(prefill.takeProfitPercent) : '',
  );
  const [stopLossPercent, setStopLossPercent] = useState(
    prefill ? String(prefill.stopLossPercent) : '',
  );

  const [gridEnabled, setGridEnabled] = useState(prefill !== undefined);
  const [gridAnchorPrice, setGridAnchorPrice] = useState('');
  const [gridSpacingPercent, setGridSpacingPercent] = useState(
    prefill ? String(prefill.spacingPercent) : '5',
  );
  const [gridTierCount, setGridTierCount] = useState(prefill ? String(prefill.tierCount) : '5');

  const [entryConfirmEnabled, setEntryConfirmEnabled] = useState(
    prefill?.entryConfirmEnabled ?? false,
  );

  const [loading, setLoading] = useState(isEditing);
  const [fetchingCurrentPrice, setFetchingCurrentPrice] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? '編輯股票' : '新增股票' });
  }, [navigation, isEditing]);

  // 新增股票時查價間隔直接帶入目前的全域預設值，不留空——使用者若沒特別調整過
  // 全域預設，state 初始值（DEFAULT_GLOBAL_INTERVAL_SEC）已經是對的，這裡只在
  // 使用者調整過全域預設時，用 DB 裡實際的值覆寫過去
  useEffect(() => {
    if (isEditing) return;
    void (async () => {
      const db = await getDb();
      setIntervalSec(String(await getGlobalDefaultIntervalSec(db)));
    })();
  }, [isEditing]);

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
      setIntervalSec(
        item.priceCheckIntervalSec !== null
          ? String(item.priceCheckIntervalSec)
          : String(await getGlobalDefaultIntervalSec(db)),
      );
      if (item.takeProfitPercent !== null) setTakeProfitPercent(String(item.takeProfitPercent));
      if (item.stopLossPercent !== null) setStopLossPercent(String(item.stopLossPercent));
      setEntryConfirmEnabled(item.entryConfirmEnabled);

      const configs = await getAllStrategyConfigs(db, watchlistId);
      for (const config of configs) {
        if (config.type === 'grid') {
          const p = config.params as GridStrategyConfig;
          setGridEnabled(config.enabled);
          setGridAnchorPrice(String(p.anchorPrice));
          setGridSpacingPercent(String(p.spacingPercent));
          setGridTierCount(String(p.tierCount));
        }
      }
      setLoading(false);
    })();
  }, [isEditing, watchlistId, navigation]);

  // 網格策略的錨定價通常就是「現在」進場的價格，開啟網格策略時直接用即時報價帶入，
  // 省得使用者自己再查一次目前價格——查不到才需要手動輸入，且只在欄位還空著時自動帶入，
  // 不會蓋掉使用者已經手動改過的值
  const fetchAndSetAnchorPrice = async (code: string): Promise<void> => {
    setFetchingCurrentPrice(true);
    try {
      const [quote] = await fetchRealtimeQuotes([code]);
      const price = quote?.lastPrice ?? quote?.previousClose;
      if (price === undefined || price === null) {
        Alert.alert('查不到目前價格', `${code} 目前查不到報價，請手動輸入錨定價`);
        return;
      }
      setGridAnchorPrice(String(price));
    } catch (err) {
      Alert.alert(
        '查詢目前價格失敗',
        `${err instanceof Error ? err.message : String(err)}\n\n請手動輸入錨定價`,
      );
    } finally {
      setFetchingCurrentPrice(false);
    }
  };

  const handleGridEnabledChange = (value: boolean): void => {
    setGridEnabled(value);
    const code = stockCode.trim();
    if (value && !isEditing && gridAnchorPrice.trim() === '' && code !== '') {
      void fetchAndSetAnchorPrice(code);
    }
  };

  useEffect(() => {
    if (isEditing || !gridEnabled || gridAnchorPrice.trim() !== '' || stockCode.trim() === '') {
      return;
    }
    const code = stockCode.trim();
    // setTimeout 讓 setState 不在 effect 這次同步執行內觸發，避免 cascading render
    const handle = setTimeout(() => {
      void fetchAndSetAnchorPrice(code);
    }, 0);
    return () => clearTimeout(handle);
    // 只在表單掛載、從「策略建議」帶入已啟用網格策略時觸發一次，之後改由 handleGridEnabledChange 接手
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const gridAnchorPriceNum = Number(gridAnchorPrice);
    const gridSpacingPercentNum = Number(gridSpacingPercent);
    const gridTierCountNum = Number(gridTierCount);
    if (
      gridEnabled &&
      (!Number.isFinite(gridAnchorPriceNum) ||
        gridAnchorPriceNum <= 0 ||
        !Number.isFinite(gridSpacingPercentNum) ||
        gridSpacingPercentNum <= 0 ||
        !Number.isFinite(gridTierCountNum) ||
        gridTierCountNum <= 0)
    ) {
      Alert.alert('請確認網格策略的錨定價、間距 %、檔位數都已正確填寫（需大於 0）');
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
            anchorPrice: gridAnchorPriceNum,
            budget: budgetNum,
            spacingPercent: gridSpacingPercentNum,
            tierCount: gridTierCountNum,
          } satisfies GridStrategyConfig,
        });
      }

      await replaceStrategyConfigs(db, id, configs);
      // 從「策略建議」套用設定進來的新增流程，儲存完直接回首頁股票清單，
      // 不要停在中間的策略建議頁（那一頁的分析結果跟剛新增的這筆股票已經無關）
      if (prefill !== undefined) {
        navigation.popToTop();
      } else {
        navigation.goBack();
      }
    } catch (err) {
      Alert.alert('儲存失敗', err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        loading ? null : (
          <Pressable hitSlop={8} onPress={() => void handleSaveRef.current()}>
            <Text style={styles.headerSaveText}>儲存</Text>
          </Pressable>
        ),
    });
  }, [navigation, loading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={typography.body}>載入中...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="基本資料">
        <InputRow
          label="股票代碼"
          placeholder="例如 2330"
          value={stockCode}
          onChangeText={setStockCode}
          autoCapitalize="characters"
        />
        <InputRow
          label="股票名稱"
          placeholder="例如 台積電"
          value={stockName}
          onChangeText={setStockName}
        />
        <InputRow label="預算" value={budget} onChangeText={setBudget} keyboardType="numeric" />
        <InputRow
          label="查價間隔（秒）"
          value={intervalSec}
          onChangeText={setIntervalSec}
          keyboardType="numeric"
        />
      </Section>

      <Section title="出場設定" footer="持有部位時用來判斷是否建議出場，留空使用預設值（停利 10%／停損 8%）">
        <InputRow
          label="停利 %"
          placeholder="留空預設 10"
          value={takeProfitPercent}
          onChangeText={setTakeProfitPercent}
          keyboardType="numeric"
        />
        <InputRow
          label="停損 %"
          placeholder="留空預設 8"
          value={stopLossPercent}
          onChangeText={setStopLossPercent}
          keyboardType="numeric"
        />
      </Section>

      <Section title="微笑曲線網格">
        {[
          <Row key="switch" label="啟用網格策略">
            <Switch value={gridEnabled} onValueChange={handleGridEnabledChange} />
          </Row>,
          ...(gridEnabled
            ? [
                <InputRow
                  key="anchor"
                  label="錨定價"
                  placeholder={fetchingCurrentPrice ? '查詢中...' : '例如 580'}
                  value={gridAnchorPrice}
                  onChangeText={setGridAnchorPrice}
                  keyboardType="numeric"
                  editable={!fetchingCurrentPrice}
                />,
                <InputRow
                  key="spacing"
                  label="間距 %"
                  value={gridSpacingPercent}
                  onChangeText={setGridSpacingPercent}
                  keyboardType="numeric"
                />,
                <InputRow
                  key="tier"
                  label="檔位數"
                  value={gridTierCount}
                  onChangeText={setGridTierCount}
                  keyboardType="numeric"
                />,
              ]
            : []),
        ]}
      </Section>

      <Section
        title="進場確認濾網"
        footer="開啟後，網格觸發時除了看趨勢是否止穩，還會多確認一次近期動能是否轉強，兩項都通過才建議進場，未通過先建議觀望。"
      >
        <Row label="啟用進場確認濾網">
          <Switch value={entryConfirmEnabled} onValueChange={setEntryConfirmEnabled} />
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
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSaveText: {
    ...typography.body,
    color: colors.tint,
    fontWeight: '600',
  },
});
