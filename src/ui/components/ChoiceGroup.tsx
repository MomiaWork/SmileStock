import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export interface ChoiceGroupOption<T> {
  value: T;
  label: string;
}

export interface ChoiceGroupProps<T> {
  options: ChoiceGroupOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * 一列可選的小藥丸按鈕，選中的用 tint 底色標出來。用於把使用者要調的參數收斂成
 * 少數幾個預先驗證過的選項（而不是自由輸入數字），符合「按表操課」原則——
 * 使用者選風格而不是自己填技術參數。
 */
export default function ChoiceGroup<T extends string | number>({
  options,
  value,
  onChange,
}: ChoiceGroupProps<T>): React.JSX.Element {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            style={[styles.pill, selected && styles.pillSelected]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pill: {
    backgroundColor: colors.fillSecondary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pillSelected: {
    backgroundColor: colors.tint,
  },
  label: {
    ...typography.footnote,
    color: colors.label,
    fontWeight: '600',
  },
  labelSelected: {
    color: '#fff',
  },
});
