import { useContext } from 'react';

import { AuthContext, type AuthContextValue } from '../contexts/AuthContext';
import type { ChatUser } from '../types/user';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  }
  return context;
}

/** Para telas protegidas: garante que existe um usuário autenticado com perfil carregado. */
export function useCurrentUser(): ChatUser {
  const { profile } = useAuth();
  if (!profile) {
    throw new Error('Tela protegida acessada sem usuário autenticado.');
  }
  return profile;
}
