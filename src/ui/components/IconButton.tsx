import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '../theme';

export interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
}

/** 給導覽列 headerLeft/headerRight 用的圖示按鈕，點擊區域比純圖示大一圈方便觸控 */
export default function IconButton({
  icon,
  onPress,
  color = colors.tint,
  size = 22,
  disabled = false,
}: IconButtonProps): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.hitArea,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    padding: 4,
  },
  pressed: {
    opacity: 0.5,
  },
  disabled: {
    opacity: 0.25,
  },
});
