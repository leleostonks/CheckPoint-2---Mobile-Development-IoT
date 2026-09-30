import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../utils/theme';

type LoadingProps = {
  message?: string;
};

export function Loading({ message }: LoadingProps) {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  message: {
    marginTop: spacing.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
