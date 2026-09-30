import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../utils/theme';

type ErrorMessageProps = {
  message: string;
  tone?: 'error' | 'warning';
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
};

export function ErrorMessage({ message, tone = 'error', actionLabel, onAction, onDismiss }: ErrorMessageProps) {
  const palette =
    tone === 'error'
      ? { background: colors.dangerLight, text: colors.danger }
      : { background: colors.warningLight, text: colors.warning };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]} accessibilityRole="alert">
      <Ionicons name={tone === 'error' ? 'alert-circle' : 'warning'} size={18} color={palette.text} />
      <Text style={[styles.message, { color: palette.text }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[styles.action, { color: palette.text }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Fechar aviso">
          <Ionicons name="close" size={18} color={palette.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    marginVertical: spacing.sm,
  },
  message: {
    flex: 1,
    fontSize: 14,
  },
  action: {
    fontWeight: '700',
  },
});
