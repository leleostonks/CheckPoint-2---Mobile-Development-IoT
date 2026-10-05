import type { TokenMessage } from 'firebase-admin/messaging';
import { z } from 'zod';

import { adminFirestore, adminMessaging } from './firebaseAdmin';

export type DeviceTarget = {
  uid: string;
  docId: string;
  token: string;
  tokenType: 'fcm' | 'expo';
};

export type PushContent = {
  title: string;
  body: string;
  /** Payload de dados: sempre contém conversationId e conversationType. */
  data: Record<string, string>;
};

export type SendResult = {
  delivered: number;
  failed: number;
  invalid: DeviceTarget[];
};

const ANDROID_CHANNEL_ID = 'messages';
const FCM_BATCH = 500;
const EXPO_BATCH = 100;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Erros do FCM que indicam token expirado/desinstalado: o token é desativado. */
const INVALID_FCM_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

const deviceSchema = z.object({
  token: z.string().min(1),
  tokenType: z.enum(['fcm', 'expo']).catch('fcm'),
  enabled: z.boolean(),
});

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/** Tokens ativos dos destinatários (`users/{uid}/devices`), lidos com privilégio administrativo. */
export async function loadDeviceTargets(recipientIds: readonly string[]): Promise<DeviceTarget[]> {
  const db = adminFirestore();
  const perUser = await Promise.all(
    recipientIds.map(async (uid) => {
      const snapshot = await db.collection('users').doc(uid).collection('devices').where('enabled', '==', true).get();
      return snapshot.docs.flatMap((doc): DeviceTarget[] => {
        const parsed = deviceSchema.safeParse(doc.data());
        return parsed.success ? [{ uid, docId: doc.id, token: parsed.data.token, tokenType: parsed.data.tokenType }] : [];
      });
    }),
  );
  return perUser.flat();
}

async function sendViaFcm(devices: readonly DeviceTarget[], content: PushContent): Promise<SendResult> {
  const result: SendResult = { delivered: 0, failed: 0, invalid: [] };
  const conversationId = content.data.conversationId ?? 'chat';

  for (const batch of chunk(devices, FCM_BATCH)) {
    // O expo-notifications fornece o token de registro do FCM (não um FID), por isso usamos TokenMessage.
    const messages: TokenMessage[] = batch.map((device) => ({
      token: device.token,
      notification: { title: content.title, body: content.body },
      data: content.data,
      android: {
        priority: 'high',
        notification: { channelId: ANDROID_CHANNEL_ID, tag: conversationId, sound: 'default' },
      },
      apns: { payload: { aps: { sound: 'default' } } },
    }));
    const response = await adminMessaging().sendEach(messages);
    response.responses.forEach((item, index) => {
      if (item.success) {
        result.delivered += 1;
        return;
      }
      result.failed += 1;
      if (item.error && INVALID_FCM_CODES.has(item.error.code)) {
        result.invalid.push(batch[index]);
      }
    });
  }
  return result;
}

const expoResponseSchema = z.object({
  data: z.array(
    z.object({
      status: z.enum(['ok', 'error']),
      details: z.object({ error: z.string().optional() }).optional(),
    }),
  ),
});

/** iOS: entrega pelo Expo Push Service (que usa APNs). */
async function sendViaExpo(devices: readonly DeviceTarget[], content: PushContent): Promise<SendResult> {
  const result: SendResult = { delivered: 0, failed: 0, invalid: [] };

  for (const batch of chunk(devices, EXPO_BATCH)) {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(
        batch.map((device) => ({
          to: device.token,
          title: content.title,
          body: content.body,
          data: content.data,
          sound: 'default',
          channelId: ANDROID_CHANNEL_ID,
        })),
      ),
    });
    const parsed = expoResponseSchema.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success || parsed.data.data.length !== batch.length) {
      // Sem um ticket por aparelho, não sabemos se o provedor aceitou o envio: não liberar retry.
      throw new Error('Resultado incerto do envio pelo Expo Push Service.');
    }
    parsed.data.data.forEach((ticket, index) => {
      if (ticket.status === 'ok') {
        result.delivered += 1;
        return;
      }
      result.failed += 1;
      if (ticket.details?.error === 'DeviceNotRegistered') {
        result.invalid.push(batch[index]);
      }
    });
  }
  return result;
}

export async function sendPush(devices: readonly DeviceTarget[], content: PushContent): Promise<SendResult> {
  const fcmDevices = devices.filter((device) => device.tokenType === 'fcm');
  const expoDevices = devices.filter((device) => device.tokenType === 'expo');
  const [fcm, expo] = await Promise.all([
    fcmDevices.length > 0 ? sendViaFcm(fcmDevices, content) : Promise.resolve<SendResult>({ delivered: 0, failed: 0, invalid: [] }),
    expoDevices.length > 0 ? sendViaExpo(expoDevices, content) : Promise.resolve<SendResult>({ delivered: 0, failed: 0, invalid: [] }),
  ]);
  return {
    delivered: fcm.delivered + expo.delivered,
    failed: fcm.failed + expo.failed,
    invalid: [...fcm.invalid, ...expo.invalid],
  };
}

/** Tokens inválidos são desativados para não receberem novas tentativas. */
export async function disableInvalidTokens(devices: readonly DeviceTarget[]): Promise<void> {
  const db = adminFirestore();
  await Promise.all(
    devices.map((device) =>
      db
        .collection('users')
        .doc(device.uid)
        .collection('devices')
        .doc(device.docId)
        .update({ enabled: false, disabledReason: 'invalid-token', updatedAt: Date.now() })
        .catch(() => undefined),
    ),
  );
}
