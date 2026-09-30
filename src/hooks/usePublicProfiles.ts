import { useEffect, useMemo, useRef, useState } from 'react';

import { getPublicProfile, subscribePublicProfiles } from '../services/userService';
import type { ProfilesById, PublicProfile } from '../types/user';
import { getErrorMessage } from '../utils/errorMessages';

/** Carrega nome e foto de um conjunto de usuários (ex.: integrantes de um grupo). */
export function usePublicProfiles(uids: readonly string[]): ProfilesById {
  const [profiles, setProfiles] = useState<ProfilesById>({});
  const requestedRef = useRef<Set<string>>(new Set());
  const key = useMemo(() => [...new Set(uids)].filter(Boolean).sort().join('|'), [uids]);

  useEffect(() => {
    const ids = key ? key.split('|') : [];
    const missing = ids.filter((uid) => !requestedRef.current.has(uid));
    if (missing.length === 0) {
      return;
    }
    missing.forEach((uid) => requestedRef.current.add(uid));
    Promise.all(missing.map((uid) => getPublicProfile(uid).catch(() => null))).then((results) => {
      const loaded = results.filter((profile): profile is PublicProfile => profile !== null);
      if (loaded.length > 0) {
        setProfiles((current) => ({
          ...current,
          ...Object.fromEntries(loaded.map((profile) => [profile.uid, profile])),
        }));
      }
    });
  }, [key]);

  return profiles;
}

type UsersState = {
  users: PublicProfile[];
  loading: boolean;
  error: string | null;
};

/** Lista de usuários cadastrados, em tempo real. */
export function useUsers(): UsersState {
  const [state, setState] = useState<UsersState>({ users: [], loading: true, error: null });

  useEffect(() => {
    const unsubscribe = subscribePublicProfiles(
      (users) => setState({ users, loading: false, error: null }),
      (error) => setState((current) => ({ ...current, loading: false, error: getErrorMessage(error) })),
    );
    return unsubscribe;
  }, []);

  return state;
}
