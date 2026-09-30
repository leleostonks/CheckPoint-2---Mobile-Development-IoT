import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PublicProfile } from '../types/user';
import { colors, spacing } from '../utils/theme';
import { Avatar } from './Avatar';

type GroupMemberItemProps = {
  uid: string;
  profile: PublicProfile | undefined;
  isOwner?: boolean;
  isCurrentUser?: boolean;
  selected?: boolean;
  disabled?: boolean;
  subtitle?: string;
  onPress?: (uid: string) => void;
  onRemove?: (uid: string) => void;
};

/** Linha de usuário usada na lista de integrantes, na seleção de membros e na lista de usuários. */
function GroupMemberItemComponent({
  uid,
  profile,
  isOwner = false,
  isCurrentUser = false,
  selected,
  disabled = false,
  subtitle,
  onPress,
  onRemove,
}: GroupMemberItemProps) {
  const name = profile?.name ?? 'Usuário';
  return (
    <Pressable
      onPress={onPress ? () => onPress(uid) : undefined}
      disabled={disabled || !onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed, disabled && styles.disabled]}
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityState={{ checked: selected, disabled }}
    >
      <Avatar uri={profile?.photoUrl} name={name} size={44} />
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
          {isCurrentUser ? ' (você)' : ''}
        </Text>
        {isOwner || subtitle ? (
          <Text style={styles.subtitle}>{isOwner ? 'Proprietário' : subtitle}</Text>
        ) : null}
      </View>
      {selected !== undefined ? (
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={selected ? colors.primary : colors.border}
        />
      ) : null}
      {onRemove ? (
        <Pressable onPress={() => onRemove(uid)} hitSlop={10} accessibilityLabel={`Remover ${name}`}>
          <Ionicons name="remove-circle" size={24} color={colors.danger} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export const GroupMemberItem = memo(GroupMemberItemComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.primaryLight,
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },
});
