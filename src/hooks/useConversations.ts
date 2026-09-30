import { useEffect, useMemo, useState } from 'react';

import { subscribeDirectConversations } from '../services/chatService';
import type { ConversationSummary, DirectConversation } from '../types/chat';
import { getErrorMessage } from '../utils/errorMessages';
import { useGroups } from './useGroups';
import { usePublicProfiles } from './usePublicProfiles';

type ConversationsState = {
  conversations: ConversationSummary[];
  loading: boolean;
  error: string | null;
};

/** Junta conversas individuais e grupos do usuário em uma única lista. */
type DirectsEntry = { uid: string; items: DirectConversation[]; error: string | null };

export function useConversations(uid: string): ConversationsState {
  const [directsEntry, setDirectsEntry] = useState<DirectsEntry | null>(null);
  const { groups, loading: groupsLoading, error: groupsError } = useGroups(uid);

  useEffect(() => {
    const unsubscribe = subscribeDirectConversations(
      uid,
      (items) => setDirectsEntry({ uid, items, error: null }),
      (error) => setDirectsEntry({ uid, items: [], error: getErrorMessage(error) }),
    );
    return unsubscribe;
  }, [uid]);

  const currentDirects = directsEntry?.uid === uid ? directsEntry : null;
  const directsLoading = currentDirects === null;
  const directsError = currentDirects?.error ?? null;
  const directs = useMemo(() => currentDirects?.items ?? [], [currentDirects]);

  const otherIds = useMemo(
    () => directs.map((conversation) => conversation.participants.find((id) => id !== uid) ?? ''),
    [directs, uid],
  );
  const profiles = usePublicProfiles(otherIds);

  const conversations = useMemo<ConversationSummary[]>(() => {
    const directItems: ConversationSummary[] = directs.map((conversation) => {
      const otherUserId = conversation.participants.find((id) => id !== uid) ?? '';
      return {
        kind: 'direct',
        id: conversation.id,
        createdAt: conversation.createdAt,
        conversation,
        otherUserId,
        otherUser: profiles[otherUserId] ?? null,
      };
    });
    const groupItems: ConversationSummary[] = groups.map((group) => ({
      kind: 'group',
      id: group.id,
      createdAt: group.updatedAt || group.createdAt,
      group,
    }));
    return [...directItems, ...groupItems].sort((a, b) => b.createdAt - a.createdAt);
  }, [directs, groups, profiles, uid]);

  return {
    conversations,
    loading: directsLoading || groupsLoading,
    error: directsError ?? groupsError,
  };
}
