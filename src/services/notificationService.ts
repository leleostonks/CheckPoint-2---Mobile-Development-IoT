import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { ANDROID_CHANNEL_ID } from '../config';
import type { DeviceRegistration, PushNotificationData, PushTokenType } from '../types/notification';
import { AppError } from '../utils/errorMessages';
import { firestore } from './firebase';

export class NotificationPermissionError extends AppError {
  constructor() {
    super('Permissão de notificações negada. Ative nas configurações do aparelho para receber avisos.');
    this.name = 'NotificationPermissionError';
  }
}

export type RegisteredToken = {
  token: string;
  tokenType: PushTokenType;
};

/** O token vira o id do documento; `/` não é permitido em ids do Firestore. */
function deviceIdFromToken(token: string): string {
  return token.replace(/\//g, '_').slice(0, 700);
}

const deviceDoc = (uid: string, token: string) => doc(firestore, 'users', uid, 'devices', deviceIdFromToken(token));

let activeConversationId: string | null = null;

/** Informa qual conversa está aberta, para não exibir banner de mensagens que o usuário já está vendo. */
export function setActiveConversation(conversationId: string | null): void {
  activeConversationId = conversationId;
}

/** Exibe a notificação com o app aberto, exceto se for da conversa que está na tela. */
export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = parseNotificationData(notification.request.content.data);
      const isOpenConversation = data !== null && data.conversationId === activeConversationId;
      return {
        shouldPlaySound: !isOpenConversation,
        shouldSetBadge: false,
        shouldShowBanner: !isOpenConversation,
        shouldShowList: !isOpenConversation,
      };
    },
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    // No Android 13+ o pedido de permissão só aparece depois que existe um canal.
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Mensagens',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

async function ensurePermission(): Promise<void> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return;
  }
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  if (!requested.granted) {
    throw new NotificationPermissionError();
  }
}

function getEasProjectId(): string | undefined {
  const fromEas = Constants.easConfig?.projectId;
  if (fromEas) {
    return fromEas;
  }
  const extra = Constants.expoConfig?.extra;
  const eas = extra && typeof extra === 'object' ? extra.eas : undefined;
  return eas && typeof eas === 'object' && typeof eas.projectId === 'string' ? eas.projectId : undefined;
}

/**
 * Android: token nativo do FCM (enviado pela API com o Firebase Admin SDK).
 * iOS: token do Expo Push Service, que entrega via APNs.
 */
async function obtainPushToken(): Promise<RegisteredToken> {
  if (Platform.OS === 'android') {
    const deviceToken = await Notifications.getDevicePushTokenAsync();
    return { token: String(deviceToken.data), tokenType: 'fcm' };
  }
  const projectId = getEasProjectId();
  if (!projectId) {
    throw new AppError('Projeto EAS não configurado: não foi possível gerar o token de push no iOS.');
  }
  const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
  return { token: expoToken.data, tokenType: 'expo' };
}

async function saveDevice(uid: string, registered: RegisteredToken): Promise<void> {
  await setDoc(deviceDoc(uid, registered.token), {
    token: registered.token,
    tokenType: registered.tokenType,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    enabled: true,
    updatedAt: Date.now(),
  } satisfies DeviceRegistration);
}

/** Solicita permissão, obtém o token do aparelho e o grava em `users/{uid}/devices`. */
export async function registerDeviceForPush(uid: string): Promise<RegisteredToken> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new AppError('Notificações push não são suportadas nesta plataforma.');
  }
  await ensureAndroidChannel();
  await ensurePermission();
  const registered = await obtainPushToken();
  await saveDevice(uid, registered);
  return registered;
}

/** Atualiza o token quando o sistema o renova (apenas tokens nativos do FCM chegam por aqui). */
export async function updateRefreshedToken(
  uid: string,
  previous: RegisteredToken | null,
  token: Notifications.DevicePushToken,
): Promise<RegisteredToken | null> {
  if (Platform.OS !== 'android') {
    return previous;
  }
  const registered: RegisteredToken = { token: String(token.data), tokenType: 'fcm' };
  if (previous && previous.token === registered.token) {
    return previous;
  }
  await saveDevice(uid, registered);
  if (previous) {
    await deleteDoc(deviceDoc(uid, previous.token)).catch(() => undefined);
  }
  return registered;
}

/** Remove o aparelho do usuário no logout, para que ele não receba mais pushes neste dispositivo. */
export async function unregisterDevice(uid: string, token: string): Promise<void> {
  await deleteDoc(deviceDoc(uid, token));
}

export function parseNotificationData(data: Record<string, unknown> | undefined): PushNotificationData | null {
  if (!data) {
    return null;
  }
  const conversationId = data.conversationId;
  const conversationType = data.conversationType;
  if (typeof conversationId !== 'string' || (conversationType !== 'direct' && conversationType !== 'group')) {
    return null;
  }
  return { conversationId, conversationType };
}
