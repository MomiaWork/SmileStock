import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchExtendedHistoricalQuotes, fetchRealtimeQuotes } from '../../data-fetch/twse-client';
import type { RankedRecommendation } from '../../strategy-engine/strategy-recommender';
import { recommendStrategyParams } from '../../strategy-engine/strategy-recommender';
import type { PricePoint } from '../../strategy-engine/types';
import PrimaryButton from '../components/PrimaryButton';
import { InputRow } from '../components/Row';
import Section from '../components/Section';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'StrategyRecommendation'>;

const BACKTEST_MONTHS = 24;

export default function StrategyRecommendationScreen({
  navigation,
}: Props): React.JSX.Element {
  const [stockCode, setStockCode] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<RankedRecommendation[] | null>(null);
  const [analyzedCode, setAnalyzedCode] = useState('');
  const [analyzedName, setAnalyzedName] = useState('');

  const handleAnalyze = async (): Promise<void> => {
    const code = stockCode.trim();
    if (code === '') {
      Alert.alert('請先輸入股票代號');
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
      const recommendations = recommendStrategyParams(history);
      if (recommendations.length === 0) {
        Alert.alert('資料不足', `${code} 過去 ${BACKTEST_MONTHS} 個月的歷史資料不足以進行回測分析`);
      }
      setAnalyzedCode(code);
      // fetchExtendedHistoricalQuotes 用的月資料端點沒有股票名稱欄位（name 只是代號的佔位值），
      // 要拿到真正的中文名稱得另外查即時報價端點；查不到就留空，不要顯示代號充當名稱
      const [realtimeQuote] = await fetchRealtimeQuotes([code]).catch(() => []);
      setAnalyzedName(realtimeQuote?.name ?? '');
      setResults(recommendations);
    } catch (err) {
      Alert.alert('分析失敗', err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApply = (item: RankedRecommendation): void => {
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
        title="分析股票"
        footer={`輸入股票代號，用過去約 ${BACKTEST_MONTHS} 個月的歷史資料試算幾組網格參數設定的表現，幫你決定新增這支股票時要用哪組設定。抓取歷史資料需要依序呼叫多次 TWSE API，可能需要一段時間，請耐心等候。`}
      >
        <InputRow
          label="股票代碼"
          placeholder="例如 2330"
          value={stockCode}
          onChangeText={setStockCode}
          autoCapitalize="characters"
        />
      </Section>
      <View style={styles.analyzeButtonWrap}>
        <PrimaryButton title="分析" onPress={() => void handleAnalyze()} loading={analyzing} />
      </View>

      {results !== null && (
        <>
          <Text style={styles.sectionTitle}>建議設定（依風險調整後報酬排序，前 5 名）</Text>
          <Text style={styles.disclaimerText}>
            以上是根據 {analyzedCode || stockCode} 過去約 {BACKTEST_MONTHS}
            個月自己的歷史資料試算出來的結果，不是保證未來也會這樣表現，僅供參考。
          </Text>
          {results.length === 0 && (
            <Text style={styles.emptyText}>資料不足，無法產生建議</Text>
          )}
          {results.map((item, index) => (
            <View key={index} style={styles.card}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankBadgeText}>{index + 1}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.resultTitle}>
                  間距 {item.params.spacingPercent}% ／ {item.params.tierCount}
                  檔 ／ 確認濾網{item.params.momentumConfirmEnabled ? '開' : '關'} ／ 停利
                  {item.params.takeProfitPercent}% ／ 停損{item.params.stopLossPercent}%
                </Text>
                <Text style={styles.resultMetrics}>
                  總報酬 {item.result.totalReturnPercent.toFixed(1)}% ／ 最大回撤{' '}
                  {item.result.maxDrawdownPercent.toFixed(1)}% ／ 交易次數 {item.result.tradeCount}
                </Text>
                <PrimaryButton title="套用這組設定" onPress={() => handleApply(item)} />
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
  emptyText: {
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
