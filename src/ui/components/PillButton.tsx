import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export interface PillButtonProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}

/** 淺灰底圓角小按鈕，用於次要動作的水平列（例如 Apple 健康／App Store 的快捷動作列） */
export default function PillButton({
  label,
  icon,
  onPress,
  disabled,
}: PillButtonProps): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.pill,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={15} color={colors.tint} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.fillSecondary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    ...typography.footnote,
    color: colors.tint,
    fontWeight: '600',
  },
});
