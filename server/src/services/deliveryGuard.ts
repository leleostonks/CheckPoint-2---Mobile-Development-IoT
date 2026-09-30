import { isRecord } from '../errors';
import { adminFirestore } from './firebaseAdmin';

const COLLECTION = 'notificationDeliveries';

function deliveryDoc(conversationId: string, messageId: string) {
  return adminFirestore().collection(COLLECTION).doc(`${conversationId}__${messageId}`);
}

function isAlreadyExists(error: unknown): boolean {
  // gRPC status 6 = ALREADY_EXISTS
  return isRecord(error) && (error.code === 6 || error.code === 'already-exists');
}

/**
 * Proteção contra chamadas duplicadas: `create()` é atômico e falha se o documento já existir.
 * Retorna `false` quando a mensagem já foi processada, e nenhuma notificação é reenviada.
 */
export async function claimDelivery(conversationId: string, messageId: string, senderId: string): Promise<boolean> {
  try {
    await deliveryDoc(conversationId, messageId).create({
      conversationId,
      messageId,
      senderId,
      status: 'processing',
      createdAt: Date.now(),
    });
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) {
      return false;
    }
    throw error;
  }
}

export async function completeDelivery(
  conversationId: string,
  messageId: string,
  result: { recipients: number; delivered: number; failed: number },
): Promise<void> {
  await deliveryDoc(conversationId, messageId).update({ status: 'done', ...result, completedAt: Date.now() });
}
