import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLastMessage } from '../hooks/useChat';
import type { ConversationSummary } from '../types/chat';
import { formatConversationDate } from '../utils/formatters';
import { colors, radius, spacing } from '../utils/theme';
import { Avatar } from './Avatar';

type ConversationItemProps = {
  item: ConversationSummary;
  currentUid: string;
  onPress: (item: ConversationSummary) => void;
};

function ConversationItemComponent({ item, currentUid, onPress }: ConversationItemProps) {
  const lastMessage = useLastMessage(item.id);
  const isGroup = item.kind === 'group';
  const title = isGroup ? item.group.name : (item.otherUser?.name ?? 'Usuário');
  const photoUrl = isGroup ? item.group.photoUrl : item.otherUser?.photoUrl;

  const preview = lastMessage
    ? `${lastMessage.senderId === currentUid ? 'Você: ' : ''}${lastMessage.text}`
    : isGroup
      ? `${item.group.memberIds.length} de ${item.group.memberLimit} integrantes`
      : 'Nenhuma mensagem ainda';
  const date = formatConversationDate(lastMessage?.createdAt ?? item.createdAt);

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${isGroup ? 'Grupo' : 'Conversa individual'} ${title}`}
    >
      <Avatar uri={photoUrl} name={title} variant={isGroup ? 'group' : 'user'} size={52} />
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.date}>{date}</Text>
        </View>
        <View style={styles.row}>
          <View style={[styles.badge, isGroup ? styles.badgeGroup : styles.badgeDirect]}>
            <Ionicons name={isGroup ? 'people' : 'person'} size={11} color={colors.primary} />
            <Text style={styles.badgeText}>{isGroup ? 'Grupo' : 'Individual'}</Text>
          </View>
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export const ConversationItem = memo(ConversationItemComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.primaryLight,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  date: {
    fontSize: 12,
    color: colors.textMuted,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeGroup: {
    backgroundColor: colors.primaryLight,
  },
  badgeDirect: {
    backgroundColor: colors.background,
  },
  badgeText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  preview: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 14,
  },
});
