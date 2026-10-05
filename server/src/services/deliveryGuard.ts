import { randomUUID } from 'node:crypto';

import { isRecord } from '../errors';
import { adminFirestore } from './firebaseAdmin';

const COLLECTION = 'notificationDeliveries';
const LEASE_MS = 60000;

function deliveryDoc(conversationId: string, messageId: string) {
  return adminFirestore().collection(COLLECTION).doc(`${conversationId}__${messageId}`);
}

/**
 * Reserva transacional: falhas confirmadas e preparação abandonada permitem nova tentativa.
 * Após iniciar o envio, resultado incerto/entrega parcial nunca permite reenviar a mensagem.
 */
export async function claimDelivery(conversationId: string, messageId: string, senderId: string): Promise<string | null> {
  const db = adminFirestore();
  const ref = deliveryDoc(conversationId, messageId);
  const attemptId = randomUUID();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current: unknown = snapshot.data();
    const now = Date.now();
    if (isRecord(current)) {
      if (current.status === 'done' || current.status === 'sending') return null;
      // Registros legados não tinham lease: processing podia incluir um envio já aceito.
      const expiresAt = typeof current.leaseExpiresAt === 'number' ? current.leaseExpiresAt : Number.POSITIVE_INFINITY;
      if (current.status === 'processing' && expiresAt > now) return null;
      if (current.status !== 'processing' && current.status !== 'failed') return null;
    }
    transaction.set(ref, {
      conversationId,
      messageId,
      senderId,
      attemptId,
      status: 'processing',
      createdAt: now,
      leaseExpiresAt: now + LEASE_MS,
    });
    return attemptId;
  });
}

/** Confere a lease antes do efeito externo e impede que um worker atrasado envie novamente. */
export async function beginDelivery(conversationId: string, messageId: string, attemptId: string): Promise<boolean> {
  const ref = deliveryDoc(conversationId, messageId);
  return adminFirestore().runTransaction(async (transaction) => {
    const current: unknown = (await transaction.get(ref)).data();
    if (!isRecord(current) || current.attemptId !== attemptId || current.status !== 'processing'
      || typeof current.leaseExpiresAt !== 'number' || current.leaseExpiresAt <= Date.now()) return false;
    transaction.update(ref, { status: 'sending' });
    return true;
  });
}

/** Só libera a preparação que falhou; uma tentativa antiga não modifica a reserva atual. */
export async function failDelivery(conversationId: string, messageId: string, attemptId: string): Promise<void> {
  const ref = deliveryDoc(conversationId, messageId);
  await adminFirestore().runTransaction(async (transaction) => {
    const current: unknown = (await transaction.get(ref)).data();
    if (isRecord(current) && current.attemptId === attemptId && current.status === 'processing') {
      transaction.update(ref, { status: 'failed', completedAt: Date.now() });
    }
  });
}

export async function completeDelivery(
  conversationId: string,
  messageId: string,
  result: { recipients: number; delivered: number; failed: number },
  attemptId: string,
): Promise<void> {
  const ref = deliveryDoc(conversationId, messageId);
  await adminFirestore().runTransaction(async (transaction) => {
    const current: unknown = (await transaction.get(ref)).data();
    if (!isRecord(current) || current.attemptId !== attemptId) return;
    const status = result.delivered === 0 && result.failed > 0 ? 'failed' : 'done';
    transaction.update(ref, { status, ...result, completedAt: Date.now() });
  });
}
