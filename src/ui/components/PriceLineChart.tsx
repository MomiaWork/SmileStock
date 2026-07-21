import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import type { PricePoint } from '../../strategy-engine/types';

export interface PriceLineChartProps {
  history: PricePoint[];
  width?: number;
  height?: number;
}

/**
 * 簡單折線圖：只畫收盤價的走勢，不含技術指標疊圖。
 * 資料點太少（<2 筆）畫不出線，顯示提示文字即可。
 */
export default function PriceLineChart({
  history,
  width = 320,
  height = 160,
}: PriceLineChartProps): React.JSX.Element {
  if (history.length < 2) {
    return (
      <View style={[styles.emptyBox, { width, height }]}>
        <Text style={styles.emptyText}>歷史資料不足，無法繪製走勢圖</Text>
      </View>
    );
  }

  const padding = 24;
  const closes = history.map((p) => p.close);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  const range = maxClose - minClose || 1;

  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const points = history.map((p, i) => {
    const x = padding + (i / (history.length - 1)) * plotWidth;
    const y = padding + plotHeight - ((p.close - minClose) / range) * plotHeight;
    return { x, y };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const last = points[points.length - 1];

  return (
    <View>
      <Svg width={width} height={height}>
        <Line
          x1={padding}
          y1={padding + plotHeight}
          x2={width - padding}
          y2={padding + plotHeight}
          stroke="#ccc"
          strokeWidth={1}
        />
        <Polyline points={polylinePoints} fill="none" stroke="#2f6feb" strokeWidth={2} />
        <Circle cx={last.x} cy={last.y} r={3} fill="#2f6feb" />
      </Svg>
      <View style={styles.legendRow}>
        <Text style={styles.legendText}>
          {history[0].date} ~ {history[history.length - 1].date}
        </Text>
        <Text style={styles.legendText}>
          低 {minClose} / 高 {maxClose}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 12,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#666',
  },
});
