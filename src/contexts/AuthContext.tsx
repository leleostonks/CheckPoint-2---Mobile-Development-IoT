import type { User } from 'firebase/auth';
import { createContext, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { observeAuthState, registerAccount, signIn, signOutUser, type RegisterResult } from '../services/authService';
import { subscribeOwnProfile } from '../services/userService';
import type { ChatUser, RegisterInput } from '../types/user';

export type AuthStatus =
  | 'initializing'
  | 'signedOut'
  | 'loadingProfile'
  | 'missingProfile'
  | 'profileError'
  | 'signedIn';

export type AuthContextValue = {
  status: AuthStatus;
  firebaseUser: User | null;
  profile: ChatUser | null;
  /** Verdadeiro enquanto o cadastro (conta + foto + perfil) está em andamento. */
  isRegistering: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

type ProfileState =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'error' }
  | { state: 'ready'; profile: ChatUser };

/** Resultado do listener do perfil, associado ao uid a que pertence. */
type ProfileEntry = { uid: string; value: ProfileState };

const LOADING: ProfileState = { state: 'loading' };

export function AuthProvider({ children }: PropsWithChildren) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profileEntry, setProfileEntry] = useState<ProfileEntry | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // Perfil de outro uid (ou ainda não recebido) é tratado como "carregando".
  const profileState: ProfileState =
    firebaseUser && !isRegistering && profileEntry?.uid === firebaseUser.uid ? profileEntry.value : LOADING;

  useEffect(() => {
    const unsubscribe = observeAuthState((user) => {
      setFirebaseUser(user);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!firebaseUser || isRegistering) {
      return undefined;
    }
    const { uid } = firebaseUser;
    const unsubscribe = subscribeOwnProfile(
      uid,
      (profile) => setProfileEntry({ uid, value: profile ? { state: 'ready', profile } : { state: 'missing' } }),
      () => setProfileEntry({ uid, value: { state: 'error' } }),
    );
    return unsubscribe;
  }, [firebaseUser, isRegistering]);

  const handleRegister = useCallback(async (input: RegisterInput) => {
    setIsRegistering(true);
    try {
      return await registerAccount(input);
    } finally {
      setIsRegistering(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOutUser();
    setProfileEntry(null);
  }, []);

  const status = useMemo<AuthStatus>(() => {
    if (initializing) {
      return 'initializing';
    }
    if (!firebaseUser || isRegistering) {
      return 'signedOut';
    }
    switch (profileState.state) {
      case 'loading':
        return 'loadingProfile';
      case 'missing':
        return 'missingProfile';
      case 'error':
        return 'profileError';
      case 'ready':
        return 'signedIn';
    }
  }, [initializing, firebaseUser, isRegistering, profileState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      firebaseUser,
      profile: profileState.state === 'ready' ? profileState.profile : null,
      isRegistering,
      signIn,
      register: handleRegister,
      signOut: handleSignOut,
    }),
    [status, firebaseUser, profileState, isRegistering, handleRegister, handleSignOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
