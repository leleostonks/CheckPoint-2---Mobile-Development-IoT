import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '../utils/theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading = false, disabled = false }: ButtonProps) {
  const isDisabled = disabled || loading;
  const palette = {
    primary: { background: colors.primary, text: '#FFFFFF', border: colors.primary },
    secondary: { background: colors.surface, text: colors.primary, border: colors.primary },
    danger: { background: colors.surface, text: colors.danger, border: colors.danger },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.background, borderColor: palette.border },
        (pressed || isDisabled) && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  dimmed: {
    opacity: 0.6,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
});
