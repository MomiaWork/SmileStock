import { Children, Fragment, isValidElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export interface SectionProps {
  title?: string;
  footer?: string;
  children: React.ReactNode;
}

/** iOS 設定 App 風格的分組卡片：標題（大寫、灰字）+ 白色圓角卡片，卡片內每個子項自動加分隔線 */
export default function Section({ title, footer, children }: SectionProps): React.JSX.Element {
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <View style={styles.wrap}>
      {title !== undefined && <Text style={styles.title}>{title}</Text>}
      <View style={styles.card}>
        {items.map((child, index) => (
          <Fragment key={index}>
            {child}
            {index < items.length - 1 && <View style={styles.divider} />}
          </Fragment>
        ))}
      </View>
      {footer !== undefined && <Text style={styles.footer}>{footer}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.footnote,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    marginLeft: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: spacing.lg,
  },
  footer: {
    ...typography.footnote,
    marginTop: spacing.xs,
    marginHorizontal: spacing.lg,
  },
});
