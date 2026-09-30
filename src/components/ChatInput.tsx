import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MAX_MESSAGE_LENGTH } from '../config';
import type { SendOptions } from '../hooks/useChat';
import type { MessageTarget } from '../types/chat';
import type { ProfilesById } from '../types/user';
import { colors, radius, spacing } from '../utils/theme';
import { MemberPickerModal } from './MemberPickerModal';

type ChatInputProps = {
  /** Outros integrantes do grupo; `null` em conversas individuais (sem menções). */
  memberIds: readonly string[] | null;
  profiles: ProfilesById;
  sending: boolean;
  disabled?: boolean;
  onSend: (options: SendOptions) => Promise<boolean>;
};

type PickerMode = 'target' | 'mention' | null;

export function ChatInput({ memberIds, profiles, sending, disabled = false, onSend }: ChatInputProps) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState<MessageTarget>({ type: 'conversation' });
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);

  const isGroup = memberIds !== null;
  const canSend = text.trim().length > 0 && !sending && !disabled;

  const targetLabel = useMemo(() => {
    if (target.type === 'conversation') {
      return 'Todos';
    }
    return profiles[target.memberId]?.name ?? 'Integrante';
  }, [target, profiles]);

  const handlePick = useCallback(
    (memberId: string | null) => {
      if (pickerMode === 'target') {
        setTarget(memberId ? { type: 'member', memberId } : { type: 'conversation' });
      } else if (pickerMode === 'mention' && memberId) {
        const name = profiles[memberId]?.name ?? 'integrante';
        setMentionedIds((current) => (current.includes(memberId) ? current : [...current, memberId]));
        setText((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}@${name} `);
      }
      setPickerMode(null);
    },
    [pickerMode, profiles],
  );

  const removeMention = useCallback((memberId: string) => {
    setMentionedIds((current) => current.filter((id) => id !== memberId));
  }, []);

  const handleSend = useCallback(async () => {
    if (!canSend) {
      return;
    }
    const sent = await onSend({ text, target, mentionedUserIds: mentionedIds });
    if (sent) {
      setText('');
      setMentionedIds([]);
      setTarget({ type: 'conversation' });
    }
  }, [canSend, onSend, text, target, mentionedIds]);

  return (
    <View style={styles.wrapper}>
      {isGroup ? (
        <View style={styles.options}>
          <Pressable style={styles.chip} onPress={() => setPickerMode('target')} accessibilityRole="button">
            <Text style={styles.chipText}>Para: {targetLabel}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.primary} />
          </Pressable>
          {mentionedIds.map((memberId) => (
            <Pressable
              key={memberId}
              style={[styles.chip, styles.mentionChip]}
              onPress={() => removeMention(memberId)}
              accessibilityLabel={`Remover menção a ${profiles[memberId]?.name ?? 'integrante'}`}
            >
              <Text style={styles.chipText}>@{profiles[memberId]?.name ?? 'integrante'}</Text>
              <Ionicons name="close" size={14} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.row}>
        {isGroup ? (
          <Pressable
            onPress={() => setPickerMode('mention')}
            style={styles.iconButton}
            accessibilityLabel="Mencionar integrante"
            disabled={disabled}
          >
            <Ionicons name="at" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Digite uma mensagem"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          editable={!disabled}
          accessibilityLabel="Campo de mensagem"
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={[styles.sendButton, !canSend && styles.sendDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Enviar mensagem"
        >
          {sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="send" size={20} color="#FFFFFF" />}
        </Pressable>
      </View>

      {isGroup ? (
        <MemberPickerModal
          visible={pickerMode !== null}
          title={pickerMode === 'target' ? 'Enviar para' : 'Mencionar integrante'}
          memberIds={memberIds}
          profiles={profiles}
          allowEveryone={pickerMode === 'target'}
          onSelect={handlePick}
          onClose={() => setPickerMode(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  mentionChip: {
    backgroundColor: colors.mention,
  },
  chipText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  iconButton: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.5,
  },
});
