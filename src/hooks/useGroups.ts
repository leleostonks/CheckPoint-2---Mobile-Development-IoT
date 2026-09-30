import { useEffect, useState } from 'react';

import { subscribeGroup, subscribeUserGroups } from '../services/groupService';
import type { ChatGroup } from '../types/group';
import { getErrorMessage } from '../utils/errorMessages';

/** Resultado de um listener associado à chave (uid/groupId) que o produziu. */
type Keyed<T> = { key: string; value: T; error: string | null };

type GroupsState = {
  groups: ChatGroup[];
  loading: boolean;
  error: string | null;
};

/** Grupos dos quais o usuário participa, em tempo real. */
export function useGroups(uid: string): GroupsState {
  const [entry, setEntry] = useState<Keyed<ChatGroup[]> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeUserGroups(
      uid,
      (groups) => setEntry({ key: uid, value: groups, error: null }),
      (error) => setEntry({ key: uid, value: [], error: getErrorMessage(error) }),
    );
    return unsubscribe;
  }, [uid]);

  const current = entry?.key === uid ? entry : null;
  return { groups: current?.value ?? [], loading: current === null, error: current?.error ?? null };
}

type GroupState = {
  group: ChatGroup | null;
  loading: boolean;
  error: string | null;
};

/** Um grupo específico, em tempo real. `null` quando não existe ou o usuário deixou de ser integrante. */
export function useGroup(groupId: string | null): GroupState {
  const [entry, setEntry] = useState<Keyed<ChatGroup | null> | null>(null);

  useEffect(() => {
    if (!groupId) {
      return undefined;
    }
    const unsubscribe = subscribeGroup(
      groupId,
      (group) => setEntry({ key: groupId, value: group, error: null }),
      (error) => setEntry({ key: groupId, value: null, error: getErrorMessage(error) }),
    );
    return unsubscribe;
  }, [groupId]);

  if (!groupId) {
    return { group: null, loading: false, error: null };
  }
  const current = entry?.key === groupId ? entry : null;
  return { group: current?.value ?? null, loading: current === null, error: current?.error ?? null };
}
