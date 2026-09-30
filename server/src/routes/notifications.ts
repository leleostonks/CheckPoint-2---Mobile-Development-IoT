import { Router } from 'express';
import { z } from 'zod';

import { firebaseKeySchema, storedMessageSchema } from '../domain';
import { HttpError } from '../errors';
import { authenticate, getAuthenticatedUid } from '../middleware/authenticate';
import { claimDelivery, completeDelivery } from '../services/deliveryGuard';
import { adminDatabase, adminFirestore } from '../services/firebaseAdmin';
import { disableInvalidTokens, loadDeviceTargets, sendPush, type PushContent } from '../services/notificationSender';
import { resolveRecipients, type ResolvedRecipients } from '../services/recipientResolver';

const bodySchema = z.object({
  conversationId: firebaseKeySchema,
  messageId: firebaseKeySchema,
});

async function loadSenderName(uid: string): Promise<string> {
  const snapshot = await adminFirestore().collection('publicProfiles').doc(uid).get();
  const name: unknown = snapshot.get('name');
  return typeof name === 'string' && name.trim() ? name.trim() : 'Alguém';
}

/** Texto do push sem o conteúdo da mensagem, para não expor informações desnecessárias. */
function buildContent(
  resolved: ResolvedRecipients,
  senderName: string,
  conversationId: string,
  messageId: string,
  wasMentioned: boolean,
): PushContent {
  const data = { conversationId, conversationType: resolved.conversationType, messageId };
  if (resolved.conversationType === 'direct' || !resolved.group) {
    return { title: senderName, body: 'Enviou uma nova mensagem.', data };
  }
  return {
    title: resolved.group.name,
    body: wasMentioned ? `${senderName} mencionou você.` : `${senderName} enviou uma mensagem.`,
    data,
  };
}

export const notificationsRouter = Router();

/**
 * POST /notifications/messages
 * 1. valida o ID token; 2. confirma no Realtime Database que a mensagem existe e é do usuário;
 * 3. lê participantes, política e tokens no Firestore; 4. envia pelo FCM (Android) / Expo (iOS).
 */
notificationsRouter.post('/notifications/messages', authenticate, async (req, res) => {
  const uid = getAuthenticatedUid(res);
  const { conversationId, messageId } = bodySchema.parse(req.body);

  const snapshot = await adminDatabase().ref(`messages/${conversationId}/${messageId}`).get();
  if (!snapshot.exists()) {
    throw new HttpError(404, 'Mensagem não encontrada.');
  }
  const parsed = storedMessageSchema.safeParse(snapshot.val());
  if (!parsed.success) {
    throw new HttpError(422, 'Mensagem com formato inválido.');
  }
  const message = parsed.data;
  if (message.senderId !== uid) {
    throw new HttpError(403, 'A mensagem não pertence ao usuário autenticado.');
  }
  if (message.conversationId !== conversationId) {
    throw new HttpError(400, 'A mensagem não pertence a esta conversa.');
  }

  const resolved = await resolveRecipients(conversationId, message);

  if (!(await claimDelivery(conversationId, messageId, uid))) {
    res.json({ status: 'duplicate', recipients: 0, delivered: 0 });
    return;
  }

  if (resolved.recipientIds.length === 0) {
    await completeDelivery(conversationId, messageId, { recipients: 0, delivered: 0, failed: 0 });
    res.json({ status: 'skipped', recipients: 0, delivered: 0, policy: resolved.policy });
    return;
  }

  const [senderName, devices] = await Promise.all([loadSenderName(uid), loadDeviceTargets(resolved.recipientIds)]);
  const mentioned = new Set([
    ...message.mentionedUserIds,
    ...(message.target.type === 'member' ? [message.target.memberId] : []),
  ]);

  // Mensagens com menção recebem texto diferente para quem foi mencionado.
  const mentionedDevices = devices.filter((device) => mentioned.has(device.uid));
  const otherDevices = devices.filter((device) => !mentioned.has(device.uid));
  const results = await Promise.all([
    sendPush(mentionedDevices, buildContent(resolved, senderName, conversationId, messageId, true)),
    sendPush(otherDevices, buildContent(resolved, senderName, conversationId, messageId, false)),
  ]);

  const delivered = results[0].delivered + results[1].delivered;
  const failed = results[0].failed + results[1].failed;
  await disableInvalidTokens([...results[0].invalid, ...results[1].invalid]);
  await completeDelivery(conversationId, messageId, { recipients: resolved.recipientIds.length, delivered, failed });

  res.json({ status: 'sent', recipients: resolved.recipientIds.length, delivered, policy: resolved.policy });
});
