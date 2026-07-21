import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getPriceHistory } from '../../db/price-history-repo';
import { getDb } from '../../db/schema';
import { syncPriceHistory } from '../../data-fetch/price-history-sync';

const TEST_STOCK_CODES = ['2330', '2317', '2454', '2412', '1301'];

/**
 * Phase 2 手動驗證用畫面：抓 5 檔股票 -> 寫入 DB -> 讀出來確認資料正確。
 * 之後 Phase 5 會用正式的股票清單頁取代這個畫面。
 */
export default function DevPriceSyncScreen(): React.JSX.Element {
  const [log, setLog] = useState<string>('尚未執行');
  const [running, setRunning] = useState(false);

  const runSync = async (): Promise<void> => {
    setRunning(true);
    setLog('執行中...');
    try {
      const db = await getDb();
      const quotes = await syncPriceHistory(db, TEST_STOCK_CODES);

      const lines: string[] = [`抓取並寫入 ${quotes.length} 檔股票：`];
      for (const quote of quotes) {
        lines.push(`${quote.code} ${quote.name}: ${quote.date} 收盤 ${quote.closingPrice}`);
      }

      lines.push('', '從 DB 讀回確認：');
      for (const code of TEST_STOCK_CODES) {
        const history = await getPriceHistory(db, code);
        const latest = history[history.length - 1];
        lines.push(
          `${code}: 共 ${history.length} 筆歷史資料，最新一筆 ${latest?.date} 收盤 ${latest?.close}`,
        );
      }

      setLog(lines.join('\n'));
    } catch (err) {
      setLog(`發生錯誤：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Phase 2 測試：TWSE 抓價 + 寫入 DB</Text>
      <Text style={styles.hint}>
        測試股票：{TEST_STOCK_CODES.join(', ')}
        {'\n'}
        按下按鈕後會抓取最新收盤價寫入 price_history（同一天重複按不會產生重複資料列）， 再從 DB
        讀回顯示。
      </Text>
      <Button
        title={running ? '執行中...' : '抓取 5 檔股票並寫入 DB'}
        onPress={runSync}
        disabled={running}
      />
      <ScrollView style={styles.logBox}>
        <Text style={styles.logText}>{log}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: '#555',
    marginBottom: 16,
  },
  logBox: {
    marginTop: 16,
    flex: 1,
  },
  logText: {
    fontFamily: 'Courier',
    fontSize: 12,
  },
});
