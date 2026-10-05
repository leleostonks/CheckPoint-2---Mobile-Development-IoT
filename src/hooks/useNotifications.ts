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
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        unregisterCurrentDevice(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Tempo de remoção do dispositivo esgotado.')), 3000);
        }),
      ]);
    } catch {
      // Offline, encerramos a sessão mesmo assim; a falha de limpeza nunca fica silenciosa.
      console.warn('Não foi possível confirmar a remoção do dispositivo de push antes do logout.');
    } finally { clearTimeout(timer); }
    await signOut();
  }, [signOut, unregisterCurrentDevice]);
}
