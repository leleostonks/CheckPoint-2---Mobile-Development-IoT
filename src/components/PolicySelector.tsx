import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { NotificationPolicy } from '../types/group';
import { NOTIFICATION_POLICIES, POLICY_LABELS } from '../utils/groupValidation';
import { colors, radius, spacing } from '../utils/theme';

type PolicySelectorProps = {
  value: NotificationPolicy;
  onChange: (policy: NotificationPolicy) => void;
  disabled?: boolean;
};

export function PolicySelector({ value, onChange, disabled = false }: PolicySelectorProps) {
  return (
    <View style={styles.container} accessibilityRole="radiogroup">
      {NOTIFICATION_POLICIES.map((policy) => {
        const selected = policy === value;
        const label = POLICY_LABELS[policy];
        return (
          <Pressable
            key={policy}
            onPress={() => onChange(policy)}
            disabled={disabled}
            style={[styles.option, selected && styles.optionSelected, disabled && styles.disabled]}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
          >
            <Ionicons
              name={selected ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={selected ? colors.primary : colors.textMuted}
            />
            <View style={styles.texts}>
              <Text style={styles.title}>{label.title}</Text>
              <Text style={styles.description}>{label.description}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  disabled: {
    opacity: 0.6,
  },
  texts: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
    color: colors.text,
  },
  description: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
});
