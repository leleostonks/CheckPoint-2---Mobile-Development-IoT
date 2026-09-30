import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing } from '../utils/theme';

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
};

export function TextField({ label, error, hint, style, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    color: colors.danger,
    marginTop: spacing.xs,
    fontSize: 13,
  },
  hint: {
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontSize: 13,
  },
});
