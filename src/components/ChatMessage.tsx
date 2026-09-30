import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ChatMessage as ChatMessageModel } from '../types/chat';
import type { ProfilesById } from '../types/user';
import { formatTime } from '../utils/formatters';
import { colors, radius, spacing } from '../utils/theme';

type ChatMessageProps = {
  message: ChatMessageModel;
  isMine: boolean;
  showAuthor: boolean;
  profiles: ProfilesById;
  currentUid: string;
};

function ChatMessageComponent({ message, isMine, showAuthor, profiles, currentUid }: ChatMessageProps) {
  const authorName = profiles[message.senderId]?.name ?? 'Integrante';
  const mentionsMe = !isMine && message.mentionedUserIds.includes(currentUid);
  const targetName =
    message.target.type === 'member'
      ? message.target.memberId === currentUid
        ? 'você'
        : (profiles[message.target.memberId]?.name ?? 'integrante')
      : null;

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowOther]}>
      <View
        style={[
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleOther,
          mentionsMe && styles.bubbleMention,
        ]}
      >
        {showAuthor && !isMine ? <Text style={styles.author}>{authorName}</Text> : null}
        {targetName ? (
          <Text style={[styles.target, isMine && styles.textMineMuted]}>Para {targetName}</Text>
        ) : null}
        <Text style={[styles.text, isMine && styles.textMine]}>{message.text}</Text>
        <Text style={[styles.time, isMine && styles.textMineMuted]}>{formatTime(message.createdAt)}</Text>
      </View>
    </View>
  );
}

export const ChatMessage = memo(ChatMessageComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginVertical: 3,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.bubbleMine,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleMention: {
    borderColor: colors.mention,
    borderWidth: 2,
  },
  author: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
  },
  target: {
    fontSize: 11,
    fontStyle: 'italic',
    color: colors.textMuted,
    marginBottom: 2,
  },
  text: {
    fontSize: 15,
    color: colors.text,
  },
  textMine: {
    color: '#FFFFFF',
  },
  textMineMuted: {
    color: '#D6E4F8',
  },
  time: {
    fontSize: 10,
    color: colors.textMuted,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
});
