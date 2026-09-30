import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { ChatInput } from '../components/ChatInput';
import { ChatMessage } from '../components/ChatMessage';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { ConnectionBanner } from '../components/StatusBanners';
import { useCurrentUser } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useGroup } from '../hooks/useGroups';
import { usePublicProfiles } from '../hooks/usePublicProfiles';
import { setActiveConversation } from '../services/notificationService';
import type { ChatMessage as ChatMessageModel, ConversationType } from '../types/chat';
import { getOtherParticipant } from '../utils/conversationId';
import { availableSlots } from '../utils/groupValidation';
import { colors, spacing } from '../utils/theme';

type ChatScreenProps = {
  conversationId: string;
  conversationType: ConversationType;
};

export function ChatScreen({ conversationId, conversationType }: ChatScreenProps) {
  const user = useCurrentUser();
  const router = useRouter();
  const isGroup = conversationType === 'group';
  const { group, loading: groupLoading, error: groupError } = useGroup(isGroup ? conversationId : null);
  const otherUserId = isGroup ? null : getOtherParticipant(conversationId, user.uid);

  const participantIds = useMemo(
    () => (isGroup ? (group?.memberIds ?? []) : otherUserId ? [otherUserId] : []),
    [isGroup, group, otherUserId],
  );
  const profiles = usePublicProfiles(participantIds);

  const { messages, loading, error, sending, sendError, pushWarning, send, clearSendError } = useChat({
    conversationId,
    conversationType,
    currentUid: user.uid,
  });

  // Evita banner de push da conversa que está aberta.
  useFocusEffect(
    useCallback(() => {
      setActiveConversation(conversationId);
      return () => setActiveConversation(null);
    }, [conversationId]),
  );

  // FlatList invertida: a mensagem mais recente fica embaixo e a rolagem começa no fim.
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const otherMemberIds = useMemo(
    () => (group ? group.memberIds.filter((id) => id !== user.uid) : null),
    [group, user.uid],
  );

  const title = isGroup ? (group?.name ?? 'Grupo') : otherUserId ? (profiles[otherUserId]?.name ?? 'Conversa') : 'Conversa';
  const photoUrl = isGroup ? group?.photoUrl : otherUserId ? profiles[otherUserId]?.photoUrl : undefined;
  const subtitle =
    isGroup && group
      ? `${group.memberIds.length}/${group.memberLimit} integrantes · ${availableSlots(group.memberLimit, group.memberIds.length)} vaga(s)`
      : null;

  const openHeader = useCallback(() => {
    if (isGroup) {
      router.push({ pathname: '/group-members/[groupId]', params: { groupId: conversationId } });
    } else if (otherUserId) {
      router.push({ pathname: '/profile/[uid]', params: { uid: otherUserId } });
    }
  }, [conversationId, isGroup, otherUserId, router]);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessageModel }) => (
      <ChatMessage
        message={item}
        isMine={item.senderId === user.uid}
        showAuthor={isGroup}
        profiles={profiles}
        currentUid={user.uid}
      />
    ),
    [isGroup, profiles, user.uid],
  );

  const header = (
    <Stack.Screen
      options={{
        headerTitle: () => (
          <Pressable style={styles.header} onPress={openHeader} accessibilityRole="button" accessibilityLabel={`Abrir detalhes de ${title}`}>
            <Avatar uri={photoUrl} name={title} size={36} variant={isGroup ? 'group' : 'user'} />
            <View style={styles.headerTexts}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
            </View>
          </Pressable>
        ),
      }}
    />
  );

  if (!isGroup && !otherUserId) {
    return <EmptyState icon="alert-circle-outline" title="Conversa inválida" />;
  }

  // Integrante removido: o grupo deixa de ser legível pelas regras do Firestore.
  if (isGroup && !groupLoading && !group) {
    return (
      <View style={styles.flex}>
        {header}
        <EmptyState
          icon="lock-closed-outline"
          title="Você não participa deste grupo"
          description={groupError ?? 'O grupo não existe mais ou você foi removido.'}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['bottom']}>
      {header}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.banners}>
          <ConnectionBanner />
          {error ? <ErrorMessage message={error} /> : null}
        </View>

        {loading || (isGroup && groupLoading) ? (
          <Loading message="Carregando mensagens..." />
        ) : (
          <FlatList
            data={invertedMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted={invertedMessages.length > 0}
            contentContainerStyle={invertedMessages.length === 0 ? styles.emptyContainer : styles.listContent}
            ListEmptyComponent={
              error ? null : (
                <EmptyState icon="chatbubble-ellipses-outline" title="Nenhuma mensagem ainda" description="Envie a primeira mensagem." />
              )
            }
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View style={styles.banners}>
          {sendError ? <ErrorMessage message={sendError} onDismiss={clearSendError} /> : null}
          {pushWarning ? <ErrorMessage tone="warning" message={pushWarning} onDismiss={clearSendError} /> : null}
        </View>

        <ChatInput
          memberIds={isGroup ? otherMemberIds : null}
          profiles={profiles}
          sending={sending}
          disabled={error !== null}
          onSend={send}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 260,
  },
  headerTexts: {
    flexShrink: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
  },
  banners: {
    paddingHorizontal: spacing.md,
  },
  listContent: {
    paddingVertical: spacing.sm,
  },
  emptyContainer: {
    flexGrow: 1,
  },
});
