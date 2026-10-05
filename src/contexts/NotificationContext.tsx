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
  const { status: authStatus, profile, firebaseUser } = useAuth();
  const router = useRouter();
  const uid = authStatus === 'signedIn' && profile ? profile.uid : null;
  const authenticatedUid = firebaseUser?.uid ?? null;

  const [attempt, setAttempt] = useState(0);
  /** Resultado do registro, associado ao usuário e à tentativa a que pertence. */
  const [statusEntry, setStatusEntry] = useState<{ key: string; status: NotificationStatus } | null>(null);
  const registeredRef = useRef<{ uid: string; token: RegisteredToken } | null>(null);
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
      // Um erro de perfil não deve apagar a referência necessária ao logout da sessão atual.
      if (!authenticatedUid) registeredRef.current = null;
      return undefined;
    }
    if (registeredRef.current?.uid !== uid) registeredRef.current = null;
    let cancelled = false;
    const report = (next: NotificationStatus) => {
      if (!cancelled) {
        setStatusEntry({ key: registrationKey, status: next });
      }
    };

    registerDeviceForPush(uid)
      .then((registered) => {
        if (cancelled) return;
        registeredRef.current = { uid, token: registered };
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
      updateRefreshedToken(uid, registeredRef.current?.token ?? null, token)
        .then((registered) => {
          if (cancelled) return;
          registeredRef.current = registered ? { uid, token: registered } : null;
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
  }, [uid, registrationKey, authenticatedUid]);

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
    if (authenticatedUid && registered?.uid === authenticatedUid) {
      await unregisterDevice(authenticatedUid, registered.token.token);
      if (registeredRef.current === registered) registeredRef.current = null;
    }
  }, [authenticatedUid]);

  const value = useMemo<NotificationContextValue>(
    () => ({ status, retryRegistration, unregisterCurrentDevice }),
    [status, retryRegistration, unregisterCurrentDevice],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
