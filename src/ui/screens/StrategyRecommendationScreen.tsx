import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchExtendedHistoricalQuotes, fetchRealtimeQuotes } from '../../data-fetch/twse-client';
import { useI18n } from '../../i18n';
import type {
  PyramidWeightsProfile,
  RecommendationResult,
  RiskLevel,
} from '../../strategy-engine/strategy-recommender';
import {
  PYRAMID_WEIGHTS_OPTIONS,
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
  const [analyzing, setAnalyzing] = useState(false);
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
      // fetchExtendedHistoricalQuotes 用的月資料端點沒有股票名稱欄位（name 只是代號的佔位值），
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

  /**
   * 一鍵套用「最佳網格＋最佳金字塔」整組參數：兩個策略會一起啟用，每天由市場狀態
   * 路由決定聽誰的，使用者不用自己預測未來是盤整還是趨勢、也不用二選一。
   */
  const handleApplyCombo = (): void => {
    if (!analysis?.bestGrid || !analysis?.bestPyramid) return;
    const weightsProfile: PyramidWeightsProfile =
      analysis.bestPyramid.params.weights.join(',') === PYRAMID_WEIGHTS_OPTIONS[0].join(',')
        ? 'equal'
        : 'pyramid';
    navigation.navigate('WatchlistForm', {
      prefill: {
        stockCode: analyzedCode,
        stockName: analyzedName,
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
      </Section>
      <View style={styles.analyzeButtonWrap}>
        <PrimaryButton
          title={strings.strategyRecommendation.analyze}
          onPress={() => void handleAnalyze()}
          loading={analyzing}
        />
      </View>

      {analysis !== null && (
        <>
          {analysis.bestGrid && analysis.bestPyramid && (
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
                    <Text
                      style={[styles.riskTagText, riskTagStyles[analysis.bestPyramid.riskLevel]]}
                    >
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
                  <PrimaryButton
                    title={strings.strategyRecommendation.applyCombo}
                    onPress={handleApplyCombo}
                  />
                </View>
              </View>
              <Text style={styles.disclaimerText}>
                {strings.strategyRecommendation.comboFooter}
              </Text>
            </>
          )}

          <Text style={styles.sectionTitle}>
            {strings.strategyRecommendation.resultsSectionTitle}
          </Text>
          <Text style={styles.disclaimerText}>
            {strings.strategyRecommendation.disclaimer(analyzedCode || stockCode, BACKTEST_MONTHS)}
          </Text>
          <Text style={styles.benchmarkText}>
            {strings.strategyRecommendation.buyHoldLabel(
              analysis.buyHoldReturnPercent.toFixed(1),
            )}
          </Text>
          {analysis.recommendations.length === 0 && (
            <Text style={styles.emptyText}>{strings.strategyRecommendation.noResults}</Text>
          )}
          {analysis.recommendations.map((item, index) => (
            <View key={index} style={styles.card}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankBadgeText}>{index + 1}</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.tagRow}>
                  <Text style={styles.typeTagText}>
                    {item.strategyType === 'grid'
                      ? strings.strategyRecommendation.strategyTypeGrid
                      : strings.strategyRecommendation.strategyTypePyramid}
                  </Text>
                  <Text style={[styles.riskTagText, riskTagStyles[item.riskLevel]]}>
                    {strings.strategyRecommendation.riskLevelLabel(riskLevelText[item.riskLevel])}
                  </Text>
                </View>
                {item.strategyType === 'grid' ? (
                  <Text style={styles.resultTitle}>
                    {strings.strategyRecommendation.resultLine1(
                      item.params.spacingPercent,
                      item.params.tierCount,
                      item.params.momentumConfirmEnabled
                        ? strings.strategyRecommendation.filterOn
                        : strings.strategyRecommendation.filterOff,
                    )}
                  </Text>
                ) : (
                  <Text style={styles.resultTitle}>
                    {strings.strategyRecommendation.pyramidResultLine1(
                      item.params.weights.join(':'),
                      item.params.addTriggerPct,
                    )}
                  </Text>
                )}
                <Text style={styles.resultMetrics}>
                  {strings.strategyRecommendation.resultLine2(
                    item.result.totalReturnPercent.toFixed(1),
                    item.result.maxDrawdownPercent.toFixed(1),
                    item.result.tradeCount,
                  )}
                </Text>
              </View>
            </View>
          ))}
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
    marginBottom: spacing.md,
    marginHorizontal: spacing.xs,
  },
  emptyText: {
    ...typography.footnote,
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
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    ...typography.footnote,
    color: '#fff',
    fontWeight: '700',
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
});
