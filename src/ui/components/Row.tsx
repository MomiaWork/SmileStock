import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { colors, spacing, typography } from '../theme';

export interface RowProps {
  label: string;
  children?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}

/** Section 卡片內的一列：左邊標籤、右邊任意內容（文字/開關/箭頭），可選 onPress 讓整列可點 */
export function Row({ label, children, onPress, destructive }: RowProps): React.JSX.Element {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper style={styles.row} onPress={onPress}>
      <Text style={[styles.label, destructive && styles.destructiveLabel]}>{label}</Text>
      {children !== undefined && <View style={styles.value}>{children}</View>}
    </Wrapper>
  );
}

export interface InputRowProps extends TextInputProps {
  label: string;
}

/** 最常見的表單列：左邊標籤、右邊靠右對齊的輸入框，視覺上融進卡片、不畫自己的外框 */
export function InputRow({ label, style, ...inputProps }: InputRowProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={colors.tertiaryLabel}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  label: {
    ...typography.body,
    flexShrink: 0,
  },
  destructiveLabel: {
    color: colors.destructive,
  },
  value: {
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  input: {
    ...typography.body,
    flex: 1,
    marginLeft: spacing.md,
    textAlign: 'right',
    color: colors.label,
  },
});
