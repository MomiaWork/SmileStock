import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fetchExtendedHistoricalQuotes } from '../../data-fetch/twse-client';
import type { RankedRecommendation } from '../../strategy-engine/strategy-recommender';
import { recommendStrategyParams } from '../../strategy-engine/strategy-recommender';
import type { PricePoint } from '../../strategy-engine/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'StrategyRecommendation'>;

const BACKTEST_MONTHS = 24;

export default function StrategyRecommendationScreen({
  navigation,
}: Props): React.JSX.Element {
  const [stockCode, setStockCode] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<RankedRecommendation[] | null>(null);
  const [analyzedCode, setAnalyzedCode] = useState('');

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
      <Text style={styles.helperText}>
        輸入股票代號，用過去約 {BACKTEST_MONTHS} 個月的歷史資料試算幾組網格參數設定的表現，
        幫你決定新增這支股票時要用哪組設定。抓取歷史資料需要依序呼叫多次 TWSE
        API，可能需要一段時間，請耐心等候。
      </Text>

      <TextInput
        style={styles.input}
        placeholder="股票代號，例如 2330"
        value={stockCode}
        onChangeText={setStockCode}
        autoCapitalize="characters"
      />
      <Button
        title={analyzing ? '分析中...' : '分析'}
        onPress={handleAnalyze}
        disabled={analyzing}
      />

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
            <View key={index} style={styles.resultRow}>
              <Text style={styles.resultTitle}>
                第 {index + 1} 名：間距 {item.params.spacingPercent}% ／ {item.params.tierCount}
                檔 ／ 確認濾網{item.params.momentumConfirmEnabled ? '開' : '關'} ／ 停利
                {item.params.takeProfitPercent}% ／ 停損{item.params.stopLossPercent}%
              </Text>
              <Text style={styles.resultMetrics}>
                總報酬 {item.result.totalReturnPercent.toFixed(1)}% ／ 最大回撤{' '}
                {item.result.maxDrawdownPercent.toFixed(1)}% ／ 交易次數 {item.result.tradeCount}
              </Text>
              <Button title="套用這組設定" onPress={() => handleApply(item)} />
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
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  helperText: {
    fontSize: 13,
    color: '#555',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 12,
  },
  emptyText: {
    color: '#888',
    fontSize: 13,
  },
  resultRow: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  resultTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  resultMetrics: {
    fontSize: 12,
    color: '#555',
    marginBottom: 8,
  },
});
