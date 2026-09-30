import { useCallback, useContext } from 'react';

import { NotificationContext, type NotificationContextValue } from '../contexts/NotificationContext';
import { useAuth } from './useAuth';

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications deve ser usado dentro de <NotificationProvider>.');
  }
  return context;
}

/** Logout completo: remove o token do aparelho e depois encerra a sessão. */
export function useSignOut(): () => Promise<void> {
  const { signOut } = useAuth();
  const { unregisterCurrentDevice } = useNotifications();
  return useCallback(async () => {
    await unregisterCurrentDevice();
    await signOut();
  }, [signOut, unregisterCurrentDevice]);
}
