import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchExtendedHistoricalQuotes, fetchRealtimeQuotes } from '../../data-fetch/twse-client';
import { useI18n } from '../../i18n';
import type { RankedRecommendation, RiskLevel } from '../../strategy-engine/strategy-recommender';
import { recommendStrategyParams } from '../../strategy-engine/strategy-recommender';
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

export default function StrategyRecommendationScreen({
  navigation,
}: Props): React.JSX.Element {
  const { strings } = useI18n();
  const riskLevelText: Record<RiskLevel, string> = {
    low: strings.strategyRecommendation.riskLevelLow,
    medium: strings.strategyRecommendation.riskLevelMedium,
    high: strings.strategyRecommendation.riskLevelHigh,
  };
  const [stockCode, setStockCode] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<RankedRecommendation[] | null>(null);
  const [buyHoldReturnPercent, setBuyHoldReturnPercent] = useState(0);
  const [analyzedCode, setAnalyzedCode] = useState('');
  const [analyzedName, setAnalyzedName] = useState('');

  const handleAnalyze = async (): Promise<void> => {
    const code = stockCode.trim();
    if (code === '') {
      Alert.alert(strings.strategyRecommendation.pleaseEnterCode);
      return;
    }

    setAnalyzing(true);
    setResults(null);
    try {
      const quotes = await fetchExtendedHistoricalQuotes(code, BACKTEST_MONTHS);
      const history: PricePoint[] = quotes.map((q) => ({
        date: q.date,
        close: q.closingPrice,
        high: q.highestPrice,
        low: q.lowestPrice,
        volume: q.tradeVolume,
      }));
      const { buyHoldReturnPercent: buyHold, recommendations } = recommendStrategyParams(history);
      if (recommendations.length === 0) {
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
      setBuyHoldReturnPercent(buyHold);
      setResults(recommendations);
    } catch (err) {
      Alert.alert(
        strings.strategyRecommendation.analyzeFailedTitle,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApply = (item: Extract<RankedRecommendation, { strategyType: 'grid' }>): void => {
    navigation.navigate('WatchlistForm', {
      prefill: {
        stockCode: analyzedCode,
        stockName: analyzedName,
        spacingPercent: item.params.spacingPercent,
        tierCount: item.params.tierCount,
        entryConfirmEnabled: item.params.momentumConfirmEnabled,
        takeProfitPercent: item.params.takeProfitPercent,
        stopLossPercent: item.params.stopLossPercent,
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

      {results !== null && (
        <>
          <Text style={styles.sectionTitle}>{strings.strategyRecommendation.resultsSectionTitle}</Text>
          <Text style={styles.disclaimerText}>
            {strings.strategyRecommendation.disclaimer(analyzedCode || stockCode, BACKTEST_MONTHS)}
          </Text>
          <Text style={styles.benchmarkText}>
            {strings.strategyRecommendation.buyHoldLabel(buyHoldReturnPercent.toFixed(1))}
          </Text>
          {results.length === 0 && (
            <Text style={styles.emptyText}>{strings.strategyRecommendation.noResults}</Text>
          )}
          {results.map((item, index) => (
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
                      item.params.takeProfitPercent,
                      item.params.stopLossPercent,
                    )}
                  </Text>
                ) : (
                  <Text style={styles.resultTitle}>
                    {strings.strategyRecommendation.pyramidResultLine1(
                      item.params.weights.join(':'),
                      item.params.addTriggerPct,
                      item.params.hardStopPct,
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
                {item.strategyType === 'grid' ? (
                  <PrimaryButton
                    title={strings.strategyRecommendation.apply}
                    onPress={() => handleApply(item)}
                  />
                ) : (
                  <Text style={styles.pyramidNoteText}>
                    {strings.strategyRecommendation.pyramidApplyUnavailable}
                  </Text>
                )}
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
  typeTagText: {
    ...typography.footnote,
    color: colors.tint,
    fontWeight: '700',
  },
  riskTagText: {
    ...typography.footnote,
    fontWeight: '700',
  },
  pyramidNoteText: {
    ...typography.footnote,
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
