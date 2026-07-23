import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { backfillPriceHistory } from '../../data-fetch/price-history-sync';
import { fetchRealtimeQuotes } from '../../data-fetch/twse-client';
import { getDb } from '../../db/schema';
import { DEFAULT_GLOBAL_INTERVAL_SEC, getGlobalDefaultIntervalSec } from '../../db/settings-repo';
import type { PersistedStrategyType } from '../../db/watchlist-repo';
import {
  addWatchlistItem,
  getAllStrategyConfigs,
  getWatchlistItem,
  replaceStrategyConfigs,
  updateWatchlistItem,
} from '../../db/watchlist-repo';
import { useI18n } from '../../i18n';
import type { GridStrategyConfig } from '../../strategy-engine/grid-strategy';
import type { PyramidConfig } from '../../strategy-engine/pyramid-state-machine';
import {
  DEFAULT_PYRAMID_PARAMS,
  minRequiredBars,
} from '../../strategy-engine/pyramid-state-machine';
import {
  PYRAMID_ADD_TRIGGER_OPTIONS,
  PYRAMID_HARD_STOP_OPTIONS,
  PYRAMID_WEIGHTS_OPTIONS,
  pyramidWeightsForProfile,
  type PyramidWeightsProfile,
} from '../../strategy-engine/strategy-recommender';
import ChoiceGroup from '../components/ChoiceGroup';
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
  const { strings } = useI18n();
  const watchlistId = route.params?.watchlistId;
  const isEditing = watchlistId !== undefined;
  // 從「策略建議」畫面帶參數過來時預填——只在新增（非編輯）情境套用，
  // 錨定價留給使用者自己填當下價格，不從建議帶入（建議是用回測區間第一天的價格算的，
  // 跟使用者現在要新增股票的當下價格無關，會用即時報價另外自動帶入）
  const prefill = isEditing ? undefined : route.params?.prefill;
  const gridPrefill = prefill?.strategyType === 'grid' ? prefill : undefined;
  const pyramidPrefill = prefill?.strategyType === 'pyramid' ? prefill : undefined;

  const [stockCode, setStockCode] = useState(prefill?.stockCode ?? '');
  const [stockName, setStockName] = useState(prefill?.stockName ?? '');
  const [budget, setBudget] = useState('100000');
  const [intervalSec, setIntervalSec] = useState(String(DEFAULT_GLOBAL_INTERVAL_SEC));
  const [takeProfitPercent, setTakeProfitPercent] = useState(
    gridPrefill ? String(gridPrefill.takeProfitPercent) : '',
  );
  const [stopLossPercent, setStopLossPercent] = useState(
    gridPrefill ? String(gridPrefill.stopLossPercent) : '',
  );

  const [gridEnabled, setGridEnabled] = useState(gridPrefill !== undefined);
  const [gridAnchorPrice, setGridAnchorPrice] = useState('');
  const [gridSpacingPercent, setGridSpacingPercent] = useState(
    gridPrefill ? String(gridPrefill.spacingPercent) : '5',
  );
  const [gridTierCount, setGridTierCount] = useState(
    gridPrefill ? String(gridPrefill.tierCount) : '5',
  );

  const [entryConfirmEnabled, setEntryConfirmEnabled] = useState(
    gridPrefill?.entryConfirmEnabled ?? false,
  );

  const [pyramidEnabled, setPyramidEnabled] = useState(pyramidPrefill !== undefined);
  const [pyramidEntryPrice, setPyramidEntryPrice] = useState('');
  const [pyramidWeightsProfile, setPyramidWeightsProfile] = useState<PyramidWeightsProfile>(
    pyramidPrefill?.weightsProfile ?? 'equal',
  );
  const [pyramidAddTriggerPct, setPyramidAddTriggerPct] = useState(
    pyramidPrefill?.addTriggerPct ?? PYRAMID_ADD_TRIGGER_OPTIONS[1],
  );
  const [pyramidHardStopPct, setPyramidHardStopPct] = useState(
    pyramidPrefill?.hardStopPct ?? PYRAMID_HARD_STOP_OPTIONS[0],
  );
  // 編輯畫面載入時，這檔標的原本是不是已經有啟用中的金字塔加碼設定——用來判斷儲存時
  // 要不要提示「會重置狀態」，新增流程（不管有沒有 pyramidPrefill）都不用提示，
  // 因為新增本來就沒有累積中的狀態可以被重置
  const [hadPyramidBeforeEdit, setHadPyramidBeforeEdit] = useState(false);

  const [loading, setLoading] = useState(isEditing);
  const [fetchingCurrentPrice, setFetchingCurrentPrice] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? strings.watchlistForm.titleEdit : strings.watchlistForm.titleAdd,
    });
  }, [navigation, isEditing, strings]);

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
        Alert.alert(strings.watchlistForm.notFound);
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
        } else if (config.type === 'pyramid') {
          const p = config.params as PyramidConfig;
          setPyramidEnabled(config.enabled);
          setPyramidEntryPrice(String(p.entryPrice));
          setPyramidWeightsProfile(
            p.weights.join(',') === PYRAMID_WEIGHTS_OPTIONS[0].join(',') ? 'equal' : 'pyramid',
          );
          setPyramidAddTriggerPct(p.addTriggerPct);
          setPyramidHardStopPct(p.hardStopPct);
          setHadPyramidBeforeEdit(true);
        }
      }
      setLoading(false);
    })();
  }, [isEditing, watchlistId, navigation, strings]);

  // 網格的錨定價、金字塔加碼的進場價，通常都是「現在」進場的價格，開啟策略時直接用
  // 即時報價帶入，省得使用者自己再查一次目前價格——查不到才需要手動輸入，且只在欄位
  // 還空著時自動帶入，不會蓋掉使用者已經手動改過的值。兩個策略共用同一個抓價函式，
  // 只是寫進不同的 setter。
  const fetchCurrentPriceInto = async (
    code: string,
    setValue: (value: string) => void,
  ): Promise<void> => {
    setFetchingCurrentPrice(true);
    try {
      const [quote] = await fetchRealtimeQuotes([code]);
      const price = quote?.lastPrice ?? quote?.previousClose;
      if (price === undefined || price === null) {
        Alert.alert(
          strings.watchlistForm.anchorNotFoundTitle,
          strings.watchlistForm.anchorNotFoundMessage(code),
        );
        return;
      }
      setValue(String(price));
    } catch (err) {
      Alert.alert(
        strings.watchlistForm.anchorFetchFailedTitle,
        `${err instanceof Error ? err.message : String(err)}${strings.watchlistForm.anchorFetchFailedSuffix}`,
      );
    } finally {
      setFetchingCurrentPrice(false);
    }
  };

  const handleGridEnabledChange = (value: boolean): void => {
    setGridEnabled(value);
    const code = stockCode.trim();
    if (value && !isEditing && gridAnchorPrice.trim() === '' && code !== '') {
      void fetchCurrentPriceInto(code, setGridAnchorPrice);
    }
  };

  const handlePyramidEnabledChange = (value: boolean): void => {
    setPyramidEnabled(value);
    const code = stockCode.trim();
    if (value && !isEditing && pyramidEntryPrice.trim() === '' && code !== '') {
      void fetchCurrentPriceInto(code, setPyramidEntryPrice);
    }
  };

  useEffect(() => {
    if (isEditing || stockCode.trim() === '') return;
    const code = stockCode.trim();
    // setTimeout 讓 setState 不在 effect 這次同步執行內觸發，避免 cascading render
    const handle = setTimeout(() => {
      if (gridEnabled && gridAnchorPrice.trim() === '') {
        void fetchCurrentPriceInto(code, setGridAnchorPrice);
      }
      if (pyramidEnabled && pyramidEntryPrice.trim() === '') {
        void fetchCurrentPriceInto(code, setPyramidEntryPrice);
      }
    }, 0);
    return () => clearTimeout(handle);
    // 只在表單掛載、從「策略建議」帶入已啟用策略時觸發一次，之後改由 handle*EnabledChange 接手
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
      Alert.alert(strings.watchlistForm.validationBasic);
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
      Alert.alert(strings.watchlistForm.validationGrid);
      return;
    }

    const pyramidEntryPriceNum = Number(pyramidEntryPrice);
    if (pyramidEnabled && (!Number.isFinite(pyramidEntryPriceNum) || pyramidEntryPriceNum <= 0)) {
      Alert.alert(strings.watchlistForm.validationPyramid);
      return;
    }

    // 編輯已經有金字塔加碼狀態的標的時，replaceStrategyConfigs 會透過 CASCADE 把
    // pyramid_state 一併刪掉（見 watchlist-repo.ts 的說明），等於重置累積的加碼進度，
    // 先跟使用者確認一次再存，避免無意間洗掉狀態
    if (isEditing && hadPyramidBeforeEdit) {
      Alert.alert(
        strings.watchlistForm.pyramidResetWarningTitle,
        strings.watchlistForm.pyramidResetWarningMessage,
        [
          { text: strings.watchlist.cancel, style: 'cancel' },
          { text: strings.common.save, onPress: () => void doSave() },
        ],
      );
      return;
    }

    await doSave();
  };

  const doSave = async (): Promise<void> => {
    const budgetNum = Number(budget);
    const gridAnchorPriceNum = Number(gridAnchorPrice);
    const gridSpacingPercentNum = Number(gridSpacingPercent);
    const gridTierCountNum = Number(gridTierCount);
    const pyramidEntryPriceNum = Number(pyramidEntryPrice);

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

    const pyramidConfig: PyramidConfig = {
      ...DEFAULT_PYRAMID_PARAMS,
      entryPrice: pyramidEntryPriceNum,
      budget: budgetNum,
      weights: pyramidWeightsForProfile(pyramidWeightsProfile),
      addTriggerPct: pyramidAddTriggerPct,
      hardStopPct: pyramidHardStopPct,
    };

    try {
      const id = isEditing ? watchlistId : await addWatchlistItem(db, watchlistPayload);
      if (isEditing) {
        await updateWatchlistItem(db, watchlistId, watchlistPayload);
      } else {
        // 金字塔狀態機要判斷市場狀態至少需要 minRequiredBars 筆資料（預設看 60 日均線），
        // 遠超過網格/RSI/均線交叉的 21 筆預設回補量，沒開金字塔就不用多抓
        const minTradingDays = pyramidEnabled
          ? Math.max(21, minRequiredBars(pyramidConfig))
          : undefined;
        try {
          await backfillPriceHistory(db, watchlistPayload.stockCode, minTradingDays);
        } catch (err) {
          // 回補歷史資料失敗不擋新增股票，之後每日同步仍會逐筆累積
          Alert.alert(
            strings.watchlistForm.backfillFailedTitle,
            `${err instanceof Error ? err.message : String(err)}${strings.watchlistForm.backfillFailedSuffix}`,
          );
        }
      }

      const configs: { type: PersistedStrategyType; params: unknown; enabled: boolean }[] = [];
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
      if (pyramidEnabled) {
        configs.push({
          type: 'pyramid',
          enabled: true,
          params: pyramidConfig satisfies PyramidConfig,
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
      Alert.alert(
        strings.watchlistForm.saveFailedTitle,
        err instanceof Error ? err.message : String(err),
      );
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
            <Text style={styles.headerSaveText}>{strings.common.save}</Text>
          </Pressable>
        ),
    });
  }, [navigation, loading, strings]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={typography.body}>{strings.common.loading}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title={strings.watchlistForm.sectionBasic}>
        <InputRow
          label={strings.watchlistForm.fieldStockCode}
          placeholder={strings.watchlistForm.placeholderStockCode}
          value={stockCode}
          onChangeText={setStockCode}
          autoCapitalize="characters"
        />
        <InputRow
          label={strings.watchlistForm.fieldStockName}
          placeholder={strings.watchlistForm.placeholderStockName}
          value={stockName}
          onChangeText={setStockName}
        />
        <InputRow
          label={strings.watchlistForm.fieldBudget}
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
        />
        <InputRow
          label={strings.watchlistForm.fieldIntervalSec}
          value={intervalSec}
          onChangeText={setIntervalSec}
          keyboardType="numeric"
        />
      </Section>

      <Section
        title={strings.watchlistForm.sectionExit}
        footer={strings.watchlistForm.sectionExitFooter}
      >
        <InputRow
          label={strings.watchlistForm.fieldTakeProfit}
          placeholder={strings.watchlistForm.placeholderTakeProfit}
          value={takeProfitPercent}
          onChangeText={setTakeProfitPercent}
          keyboardType="numeric"
        />
        <InputRow
          label={strings.watchlistForm.fieldStopLoss}
          placeholder={strings.watchlistForm.placeholderStopLoss}
          value={stopLossPercent}
          onChangeText={setStopLossPercent}
          keyboardType="numeric"
        />
      </Section>

      <Section title={strings.watchlistForm.sectionGrid}>
        {[
          <Row key="switch" label={strings.watchlistForm.fieldGridEnabled}>
            <Switch value={gridEnabled} onValueChange={handleGridEnabledChange} />
          </Row>,
          ...(gridEnabled
            ? [
                <InputRow
                  key="anchor"
                  label={strings.watchlistForm.fieldAnchorPrice}
                  placeholder={
                    fetchingCurrentPrice
                      ? strings.watchlistForm.placeholderAnchorFetching
                      : strings.watchlistForm.placeholderAnchorExample
                  }
                  value={gridAnchorPrice}
                  onChangeText={setGridAnchorPrice}
                  keyboardType="numeric"
                  editable={!fetchingCurrentPrice}
                />,
                <InputRow
                  key="spacing"
                  label={strings.watchlistForm.fieldSpacingPercent}
                  value={gridSpacingPercent}
                  onChangeText={setGridSpacingPercent}
                  keyboardType="numeric"
                />,
                <InputRow
                  key="tier"
                  label={strings.watchlistForm.fieldTierCount}
                  value={gridTierCount}
                  onChangeText={setGridTierCount}
                  keyboardType="numeric"
                />,
              ]
            : []),
        ]}
      </Section>

      <Section
        title={strings.watchlistForm.sectionPyramid}
        footer={strings.watchlistForm.sectionPyramidFooter}
      >
        {[
          <Row key="switch" label={strings.watchlistForm.fieldPyramidEnabled}>
            <Switch value={pyramidEnabled} onValueChange={handlePyramidEnabledChange} />
          </Row>,
          ...(pyramidEnabled
            ? [
                <InputRow
                  key="entryPrice"
                  label={strings.watchlistForm.fieldEntryPrice}
                  placeholder={
                    fetchingCurrentPrice
                      ? strings.watchlistForm.placeholderEntryFetching
                      : strings.watchlistForm.placeholderEntryExample
                  }
                  value={pyramidEntryPrice}
                  onChangeText={setPyramidEntryPrice}
                  keyboardType="numeric"
                  editable={!fetchingCurrentPrice}
                />,
                <Row key="addOnStyle" label={strings.watchlistForm.fieldAddOnStyle} />,
                <View key="addOnStyleChoice" style={styles.choiceWrap}>
                  <ChoiceGroup
                    options={[
                      { value: 'equal', label: strings.watchlistForm.addOnStyleEqual },
                      { value: 'pyramid', label: strings.watchlistForm.addOnStylePyramid },
                    ]}
                    value={pyramidWeightsProfile}
                    onChange={setPyramidWeightsProfile}
                  />
                </View>,
                <Row key="addOnPace" label={strings.watchlistForm.fieldAddOnPace} />,
                <View key="addOnPaceChoice" style={styles.choiceWrap}>
                  <ChoiceGroup
                    options={PYRAMID_ADD_TRIGGER_OPTIONS.map((pct) => ({
                      value: pct,
                      label: `${pct}%`,
                    }))}
                    value={pyramidAddTriggerPct}
                    onChange={setPyramidAddTriggerPct}
                  />
                </View>,
                <Row key="hardStop" label={strings.watchlistForm.fieldHardStopChoice} />,
                <View key="hardStopChoice" style={styles.choiceWrap}>
                  <ChoiceGroup
                    options={PYRAMID_HARD_STOP_OPTIONS.map((pct) => ({
                      value: pct,
                      label: `${pct}%`,
                    }))}
                    value={pyramidHardStopPct}
                    onChange={setPyramidHardStopPct}
                  />
                </View>,
              ]
            : []),
        ]}
      </Section>

      <Section
        title={strings.watchlistForm.sectionEntryConfirm}
        footer={strings.watchlistForm.sectionEntryConfirmFooter}
      >
        <Row label={strings.watchlistForm.fieldEntryConfirmEnabled}>
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
  choiceWrap: {
    marginTop: -spacing.sm,
  },
  headerSaveText: {
    ...typography.body,
    color: colors.tint,
    fontWeight: '600',
  },
});
