import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchExtendedHistoricalQuotes, fetchRealtimeQuotes } from '../../data-fetch/twse-client';
import { getDb } from '../../db/schema';
import { addWatchlistItemWithStrategies } from '../../db/watchlist-onboarding';
import { useI18n } from '../../i18n';
import type { GridStrategyConfig } from '../../strategy-engine/grid-strategy';
import {
  DEFAULT_PYRAMID_PARAMS,
  type PyramidConfig,
} from '../../strategy-engine/pyramid-state-machine';
import type {
  PyramidWeightsProfile,
  RecommendationResult,
  RiskLevel,
} from '../../strategy-engine/strategy-recommender';
import {
  PYRAMID_WEIGHTS_OPTIONS,
  pyramidWeightsForProfile,
  recommendStrategyParams,
} from '../../strategy-engine/strategy-recommender';
import type { PricePoint } from '../../strategy-engine/types';
import PrimaryButton from '../components/PrimaryButton';
import { InputRow } from '../components/Row';
import Section from '../components/Section';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'StrategyRecommendation'>;

const BACKTEST_MONTHS = 24;

const riskTagStyles: Record<RiskLevel, { color: string }> = {
  low: { color: colors.profit },
  medium: { color: colors.warning },
  high: { color: colors.destructive },
};

export default function StrategyRecommendationScreen({ navigation }: Props): React.JSX.Element {
  const { strings } = useI18n();
  const riskLevelText: Record<RiskLevel, string> = {
    low: strings.strategyRecommendation.riskLevelLow,
    medium: strings.strategyRecommendation.riskLevelMedium,
    high: strings.strategyRecommendation.riskLevelHigh,
  };
  const [stockCode, setStockCode] = useState('');
  const [budget, setBudget] = useState('100000');
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [analysis, setAnalysis] = useState<RecommendationResult | null>(null);
  const [analyzedCode, setAnalyzedCode] = useState('');
  const [analyzedName, setAnalyzedName] = useState('');

  const handleAnalyze = async (): Promise<void> => {
    const code = stockCode.trim();
    if (code === '') {
      Alert.alert(strings.strategyRecommendation.pleaseEnterCode);
      return;
    }

    setAnalyzing(true);
    setAnalysis(null);
    try {
      const quotes = await fetchExtendedHistoricalQuotes(code, BACKTEST_MONTHS);
      const history: PricePoint[] = quotes.map((q) => ({
        date: q.date,
        close: q.closingPrice,
        high: q.highestPrice,
        low: q.lowestPrice,
        volume: q.tradeVolume,
      }));
      const result = recommendStrategyParams(history);
      if (result.recommendations.length === 0) {
        Alert.alert(
          strings.strategyRecommendation.insufficientDataTitle,
          strings.strategyRecommendation.insufficientDataMessage(code, BACKTEST_MONTHS),
        );
      }
      setAnalyzedCode(code);
      // fetchExtendedHistoricalQuotes 用的月資料端點沒有標的名稱欄位（name 只是代號的佔位值），
      // 要拿到真正的中文名稱得另外查即時報價端點；查不到就留空，不要顯示代號充當名稱
      const [realtimeQuote] = await fetchRealtimeQuotes([code]).catch(() => []);
      setAnalyzedName(realtimeQuote?.name ?? '');
      setAnalysis(result);
    } catch (err) {
      Alert.alert(
        strings.strategyRecommendation.analyzeFailedTitle,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const comboWeightsProfile = (): PyramidWeightsProfile | undefined => {
    if (!analysis?.bestPyramid) return undefined;
    const weightsKey = analysis.bestPyramid.params.weights.join(',');
    if (weightsKey === PYRAMID_WEIGHTS_OPTIONS[0].join(',')) return 'equal';
    if (weightsKey === PYRAMID_WEIGHTS_OPTIONS[2].join(',')) return 'decreasing';
    return 'pyramid';
  };

  /**
   * 直接套用「最佳網格＋最佳金字塔」整組參數並存檔回首頁：兩個策略會一起啟用，每天由
   * 市場狀態路由決定聽誰的，使用者不用自己預測未來是盤整還是趨勢、也不用二選一。
   * 不經過新增表單——多策略並行已經是既定選擇，不需要使用者再看一次細項才能確認；
   * 想調整細節的人改走 handleEditCombo。
   */
  const handleApplyCombo = async (): Promise<void> => {
    if (!analysis?.bestGrid || !analysis?.bestPyramid) return;
    const weightsProfile = comboWeightsProfile();
    if (!weightsProfile) return;

    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      Alert.alert(strings.strategyRecommendation.invalidBudget);
      return;
    }

    setApplying(true);
    try {
      const [quote] = await fetchRealtimeQuotes([analyzedCode]);
      const price = quote?.lastPrice ?? quote?.previousClose;
      if (price === undefined || price === null) {
        Alert.alert(
          strings.strategyRecommendation.priceNotFoundTitle,
          strings.strategyRecommendation.priceNotFoundMessage(analyzedCode),
        );
        return;
      }

      const gridConfig: GridStrategyConfig = {
        anchorPrice: price,
        budget: budgetNum,
        spacingPercent: analysis.bestGrid.params.spacingPercent,
        tierCount: analysis.bestGrid.params.tierCount,
      };
      const pyramidConfig: PyramidConfig = {
        ...DEFAULT_PYRAMID_PARAMS,
        entryPrice: price,
        budget: budgetNum,
        weights: pyramidWeightsForProfile(weightsProfile),
        addTriggerPct: analysis.bestPyramid.params.addTriggerPct,
      };

      const db = await getDb();
      const { backfillError } = await addWatchlistItemWithStrategies(db, {
        item: {
          stockCode: analyzedCode,
          stockName: analyzedName || analyzedCode,
          budget: budgetNum,
          entryConfirmEnabled: analysis.bestGrid.params.momentumConfirmEnabled,
        },
        grid: gridConfig,
        pyramid: pyramidConfig,
      });
      if (backfillError) {
        Alert.alert(
          strings.watchlistForm.backfillFailedTitle,
          `${backfillError.message}${strings.watchlistForm.backfillFailedSuffix}`,
        );
      }
      navigation.popToTop();
    } catch (err) {
      Alert.alert(
        strings.strategyRecommendation.applyFailedTitle,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setApplying(false);
    }
  };

  /** 想在存檔前調整細項（錨定價、查價間隔等）的人，改走原本的新增表單預填流程 */
  const handleEditCombo = (): void => {
    if (!analysis?.bestGrid || !analysis?.bestPyramid) return;
    const weightsProfile = comboWeightsProfile();
    if (!weightsProfile) return;
    const budgetNum = Number(budget);

    navigation.navigate('WatchlistForm', {
      prefill: {
        stockCode: analyzedCode,
        stockName: analyzedName,
        budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
        grid: {
          spacingPercent: analysis.bestGrid.params.spacingPercent,
          tierCount: analysis.bestGrid.params.tierCount,
          entryConfirmEnabled: analysis.bestGrid.params.momentumConfirmEnabled,
        },
        pyramid: {
          weightsProfile,
          addTriggerPct: analysis.bestPyramid.params.addTriggerPct,
        },
      },
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section
        title={strings.strategyRecommendation.sectionAnalyze}
        footer={strings.strategyRecommendation.sectionAnalyzeFooter(BACKTEST_MONTHS)}
      >
        <InputRow
          label={strings.strategyRecommendation.fieldStockCode}
          placeholder={strings.strategyRecommendation.placeholderStockCode}
          value={stockCode}
          onChangeText={setStockCode}
          autoCapitalize="characters"
        />
        <InputRow
          label={strings.strategyRecommendation.fieldBudget}
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
        />
      </Section>
      <View style={styles.analyzeButtonWrap}>
        <PrimaryButton
          title={strings.strategyRecommendation.analyze}
          onPress={() => void handleAnalyze()}
          loading={analyzing}
        />
      </View>

      {analysis !== null && analysis.bestGrid && analysis.bestPyramid && (
        <>
          <Text style={styles.sectionTitle}>
            {strings.strategyRecommendation.comboSectionTitle}
          </Text>
          <View style={styles.card}>
            <View style={styles.cardBody}>
              <View style={styles.tagRow}>
                <Text style={styles.typeTagText}>
                  {strings.strategyRecommendation.strategyTypeGrid}
                </Text>
                <Text style={[styles.riskTagText, riskTagStyles[analysis.bestGrid.riskLevel]]}>
                  {strings.strategyRecommendation.riskLevelLabel(
                    riskLevelText[analysis.bestGrid.riskLevel],
                  )}
                </Text>
              </View>
              <Text style={styles.resultTitle}>
                {strings.strategyRecommendation.resultLine1(
                  analysis.bestGrid.params.spacingPercent,
                  analysis.bestGrid.params.tierCount,
                  analysis.bestGrid.params.momentumConfirmEnabled
                    ? strings.strategyRecommendation.filterOn
                    : strings.strategyRecommendation.filterOff,
                )}
              </Text>
              <Text style={styles.resultMetrics}>
                {strings.strategyRecommendation.resultLine2(
                  analysis.bestGrid.result.totalReturnPercent.toFixed(1),
                  analysis.bestGrid.result.maxDrawdownPercent.toFixed(1),
                  analysis.bestGrid.result.tradeCount,
                )}
              </Text>
              <View style={[styles.tagRow, styles.comboSecondTag]}>
                <Text style={styles.typeTagText}>
                  {strings.strategyRecommendation.strategyTypePyramid}
                </Text>
                <Text style={[styles.riskTagText, riskTagStyles[analysis.bestPyramid.riskLevel]]}>
                  {strings.strategyRecommendation.riskLevelLabel(
                    riskLevelText[analysis.bestPyramid.riskLevel],
                  )}
                </Text>
              </View>
              <Text style={styles.resultTitle}>
                {strings.strategyRecommendation.pyramidResultLine1(
                  analysis.bestPyramid.params.weights.join(':'),
                  analysis.bestPyramid.params.addTriggerPct,
                )}
              </Text>
              <Text style={styles.resultMetrics}>
                {strings.strategyRecommendation.resultLine2(
                  analysis.bestPyramid.result.totalReturnPercent.toFixed(1),
                  analysis.bestPyramid.result.maxDrawdownPercent.toFixed(1),
                  analysis.bestPyramid.result.tradeCount,
                )}
              </Text>
              <Text style={styles.benchmarkText}>
                {strings.strategyRecommendation.buyHoldLabel(
                  analysis.buyHoldReturnPercent.toFixed(1),
                )}
              </Text>
              <PrimaryButton
                title={strings.strategyRecommendation.applyCombo}
                onPress={() => void handleApplyCombo()}
                loading={applying}
              />
              <Pressable
                hitSlop={8}
                onPress={handleEditCombo}
                disabled={applying}
                style={styles.editLink}
              >
                <Text style={styles.editLinkText}>{strings.strategyRecommendation.editCombo}</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.disclaimerText}>{strings.strategyRecommendation.comboFooter}</Text>
          <Text style={styles.disclaimerText}>
            {strings.strategyRecommendation.disclaimer(analyzedCode || stockCode, BACKTEST_MONTHS)}
          </Text>
        </>
      )}
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
  analyzeButtonWrap: {
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.footnote,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    marginLeft: spacing.lg,
  },
  disclaimerText: {
    ...typography.footnote,
    marginBottom: spacing.md,
    marginHorizontal: spacing.xs,
  },
  benchmarkText: {
    ...typography.footnote,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  comboSecondTag: {
    marginTop: spacing.sm,
  },
  typeTagText: {
    ...typography.footnote,
    color: colors.tint,
    fontWeight: '700',
  },
  riskTagText: {
    ...typography.footnote,
    fontWeight: '700',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    gap: spacing.md,
  },
  cardBody: {
    flex: 1,
    gap: spacing.sm,
  },
  resultTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  resultMetrics: {
    ...typography.footnote,
  },
  editLink: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  editLinkText: {
    ...typography.footnote,
    color: colors.tint,
    fontWeight: '600',
  },
});
