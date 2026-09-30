import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { useAuth } from '../hooks/useAuth';
import {
  NotificationPermissionError,
  configureForegroundNotifications,
  parseNotificationData,
  registerDeviceForPush,
  unregisterDevice,
  updateRefreshedToken,
  type RegisteredToken,
} from '../services/notificationService';
import type { NotificationStatus, PushNotificationData } from '../types/notification';
import { getErrorMessage } from '../utils/errorMessages';

export type NotificationContextValue = {
  status: NotificationStatus;
  retryRegistration: () => void;
  /** Remove o token deste aparelho do usuário atual (chamado antes do logout). */
  unregisterCurrentDevice: () => Promise<void>;
};

export const NotificationContext = createContext<NotificationContextValue | null>(null);

configureForegroundNotifications();

export function NotificationProvider({ children }: PropsWithChildren) {
  const { status: authStatus, profile } = useAuth();
  const router = useRouter();
  const uid = authStatus === 'signedIn' && profile ? profile.uid : null;

  const [attempt, setAttempt] = useState(0);
  /** Resultado do registro, associado ao usuário e à tentativa a que pertence. */
  const [statusEntry, setStatusEntry] = useState<{ key: string; status: NotificationStatus } | null>(null);
  const registeredRef = useRef<RegisteredToken | null>(null);
  const handledResponseRef = useRef<string | null>(null);

  const registrationKey = uid ? `${uid}#${attempt}` : null;
  const status = useMemo<NotificationStatus>(() => {
    if (!registrationKey) {
      return { state: 'idle' };
    }
    return statusEntry?.key === registrationKey ? statusEntry.status : { state: 'registering' };
  }, [registrationKey, statusEntry]);

  // Registro do aparelho após o login (e a cada nova tentativa).
  useEffect(() => {
    if (!uid || !registrationKey) {
      registeredRef.current = null;
      return undefined;
    }
    let cancelled = false;
    const report = (next: NotificationStatus) => {
      if (!cancelled) {
        setStatusEntry({ key: registrationKey, status: next });
      }
    };

    registerDeviceForPush(uid)
      .then((registered) => {
        registeredRef.current = registered;
        report({ state: 'registered', token: registered.token });
      })
      .catch((error: unknown) => {
        report(
          error instanceof NotificationPermissionError
            ? { state: 'permission-denied' }
            : { state: 'unavailable', reason: getErrorMessage(error, 'Token de notificação indisponível.') },
        );
      });

    const subscription = Notifications.addPushTokenListener((token) => {
      updateRefreshedToken(uid, registeredRef.current, token)
        .then((registered) => {
          registeredRef.current = registered;
          if (registered) {
            report({ state: 'registered', token: registered.token });
          }
        })
        .catch((error: unknown) => report({ state: 'error', message: getErrorMessage(error) }));
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [uid, registrationKey]);

  // Toque na notificação: cobre app aberto, em segundo plano e fechado (useLastNotificationResponse).
  const lastResponse = Notifications.useLastNotificationResponse();
  const tapped = useMemo<{ id: string; data: PushNotificationData } | null>(() => {
    if (!lastResponse) {
      return null;
    }
    const data = parseNotificationData(lastResponse.notification.request.content.data);
    return data ? { id: lastResponse.notification.request.identifier, data } : null;
  }, [lastResponse]);

  // Só navega depois que o usuário estiver autenticado e com o perfil carregado.
  useEffect(() => {
    if (!uid || !tapped || handledResponseRef.current === tapped.id) {
      return;
    }
    handledResponseRef.current = tapped.id;
    router.push({
      pathname: '/chat/[conversationId]',
      params: { conversationId: tapped.data.conversationId, type: tapped.data.conversationType },
    });
  }, [uid, tapped, router]);

  const retryRegistration = useCallback(() => setAttempt((value) => value + 1), []);

  const unregisterCurrentDevice = useCallback(async () => {
    const registered = registeredRef.current;
    if (uid && registered) {
      await unregisterDevice(uid, registered.token).catch(() => undefined);
      registeredRef.current = null;
    }
  }, [uid]);

  const value = useMemo<NotificationContextValue>(
    () => ({ status, retryRegistration, unregisterCurrentDevice }),
    [status, retryRegistration, unregisterCurrentDevice],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
