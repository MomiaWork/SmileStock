import { StyleSheet } from 'react-native';

/**
 * 沿用 iOS 系統色票／字級（Human Interface Guidelines）的簡化版設計語彙，
 * 讓全 App 畫面風格一致。目前只做淺色模式，深色模式之後要做的話從這裡擴充。
 */
export const colors = {
  background: '#F2F2F7',
  card: '#FFFFFF',
  label: '#000000',
  secondaryLabel: '#6B6B70',
  tertiaryLabel: '#AEAEB2',
  separator: '#E5E5EA',
  tint: '#007AFF',
  destructive: '#FF3B30',
  /** 台股慣例：上漲紅、下跌綠，跟損益的 profit/loss 剛好相反，兩組語意分開命名避免混淆 */
  rise: '#FF3B30',
  fall: '#34C759',
  profit: '#34C759',
  loss: '#FF3B30',
  warning: '#FF9500',
  fillSecondary: '#EFEFF4',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = StyleSheet.create({
  largeTitle: { fontSize: 34, fontWeight: '700', color: colors.label },
  title2: { fontSize: 22, fontWeight: '700', color: colors.label },
  title3: { fontSize: 20, fontWeight: '600', color: colors.label },
  headline: { fontSize: 17, fontWeight: '600', color: colors.label },
  body: { fontSize: 17, fontWeight: '400', color: colors.label },
  subheadline: { fontSize: 15, fontWeight: '400', color: colors.secondaryLabel },
  footnote: { fontSize: 13, fontWeight: '400', color: colors.secondaryLabel },
  caption: { fontSize: 12, fontWeight: '400', color: colors.tertiaryLabel },
});
