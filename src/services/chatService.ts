import {
  limitToLast,
  onValue,
  orderByKey,
  push,
  query as rtdbQuery,
  ref,
  serverTimestamp,
  set,
  type DataSnapshot,
} from 'firebase/database';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { MAX_MESSAGE_LENGTH, MESSAGES_PAGE_SIZE } from '../config';
import type { ChatMessage, ConversationType, DirectConversation, MessageTarget, SendMessageInput } from '../types/chat';
import type { PushDispatchResult } from '../types/notification';
import { buildDirectConversationId } from '../utils/conversationId';
import { AppError } from '../utils/errorMessages';
import { createReader } from '../utils/firestore';
import { isRecord, readNumber, readRecord, readString, readStringArray, type UnknownRecord } from '../utils/parse';
import { ApiError, apiRequest } from './apiClient';
import { firestore, realtimeDb } from './firebase';

/* ---------- Conversas individuais (Firestore) ---------- */

type DirectConversationDocument = { participantIds: [string, string]; createdAt: number };

const directReader = createReader<DirectConversation>((id, data) => {
  const ids = readStringArray(data, 'participantIds');
  return {
    id,
    type: 'direct',
    participants: [ids[0] ?? '', ids[1] ?? ''],
    createdAt: readNumber(data, 'createdAt'),
  };
});

const directCollection = () => collection(firestore, 'directConversations').withConverter(directReader);

export function subscribeDirectConversations(
  uid: string,
  onChange: (conversations: DirectConversation[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const directQuery = query(directCollection(), where('participantIds', 'array-contains', uid));
  return onSnapshot(directQuery, (snapshot) => onChange(snapshot.docs.map((item) => item.data())), onError);
}

/** Localiza a conversa individual do par ou a cria. O id determinístico impede duplicidade. */
export async function getOrCreateDirectConversation(myUid: string, otherUid: string): Promise<string> {
  if (myUid === otherUid) {
    throw new AppError('Não é possível iniciar uma conversa consigo mesmo.');
  }
  const conversationId = buildDirectConversationId(myUid, otherUid);
  const ref = doc(firestore, 'directConversations', conversationId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    const participantIds: [string, string] = myUid < otherUid ? [myUid, otherUid] : [otherUid, myUid];
    await setDoc(ref, { participantIds, createdAt: Date.now() } satisfies DirectConversationDocument);
  }
  return conversationId;
}

/* ---------- Mensagens (Realtime Database) ---------- */

function parseTarget(data: UnknownRecord): MessageTarget {
  const target = readRecord(data, 'target');
  if (target && target.type === 'member' && typeof target.memberId === 'string') {
    return { type: 'member', memberId: target.memberId };
  }
  return { type: 'conversation' };
}

function parseMessage(conversationId: string, snapshot: DataSnapshot): ChatMessage | null {
  const value: unknown = snapshot.val();
  if (!snapshot.key || !isRecord(value)) {
    return null;
  }
  const type = value.conversationType;
  const conversationType: ConversationType = type === 'group' ? 'group' : 'direct';
  return {
    id: snapshot.key,
    conversationId,
    conversationType,
    senderId: readString(value, 'senderId'),
    text: readString(value, 'text'),
    target: parseTarget(value),
    mentionedUserIds: readStringArray(value, 'mentionedUserIds'),
    createdAt: readNumber(value, 'createdAt', Date.now()),
  };
}

function snapshotToMessages(conversationId: string, snapshot: DataSnapshot): ChatMessage[] {
  const messages: ChatMessage[] = [];
  snapshot.forEach((child) => {
    const message = parseMessage(conversationId, child);
    if (message) {
      messages.push(message);
    }
  });
  return messages;
}

/** Escuta as últimas mensagens da conversa em tempo real. Retorna a função que remove o listener. */
export function subscribeMessages(
  conversationId: string,
  onChange: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void,
): () => void {
  const messagesQuery = rtdbQuery(
    ref(realtimeDb, `messages/${conversationId}`),
    orderByKey(),
    limitToLast(MESSAGES_PAGE_SIZE),
  );
  return onValue(messagesQuery, (snapshot) => onChange(snapshotToMessages(conversationId, snapshot)), onError);
}

export function subscribeLastMessage(
  conversationId: string,
  onChange: (message: ChatMessage | null) => void,
  onError: (error: Error) => void,
): () => void {
  const lastQuery = rtdbQuery(ref(realtimeDb, `messages/${conversationId}`), orderByKey(), limitToLast(1));
  return onValue(
    lastQuery,
    (snapshot) => {
      const messages = snapshotToMessages(conversationId, snapshot);
      onChange(messages.length > 0 ? messages[messages.length - 1] : null);
    },
    onError,
  );
}

/** Indica se o cliente está conectado ao Realtime Database (`.info/connected`). */
export function subscribeConnection(onChange: (connected: boolean) => void): () => void {
  return onValue(ref(realtimeDb, '.info/connected'), (snapshot) => onChange(snapshot.val() === true));
}

/** Persiste a mensagem no Realtime Database e retorna o id gerado. */
export async function sendMessage(input: SendMessageInput): Promise<string> {
  const text = input.text.trim();
  if (text.length === 0) {
    throw new AppError('Digite uma mensagem.');
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(`A mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`);
  }

  const messageRef = push(ref(realtimeDb, `messages/${input.conversationId}`));
  if (!messageRef.key) {
    throw new AppError('Não foi possível gerar o identificador da mensagem.');
  }

  await set(messageRef, {
    conversationId: input.conversationId,
    conversationType: input.conversationType,
    senderId: input.senderId,
    text,
    target: input.target,
    mentionedUserIds: input.mentionedUserIds,
    createdAt: serverTimestamp(),
  });

  return messageRef.key;
}

function parsePushResult(body: unknown): PushDispatchResult {
  if (
    isRecord(body) &&
    (body.status === 'sent' || body.status === 'duplicate' || body.status === 'skipped') &&
    typeof body.recipients === 'number' &&
    typeof body.delivered === 'number'
  ) {
    return { status: body.status, recipients: body.recipients, delivered: body.delivered };
  }
  throw new ApiError('Resposta inesperada do servidor de notificações.', 500);
}

/** Solicita à API online o envio do push. Os destinatários são calculados no servidor. */
export async function requestMessagePush(conversationId: string, messageId: string): Promise<PushDispatchResult> {
  return apiRequest(
    '/notifications/messages',
    { method: 'POST', body: { conversationId, messageId } },
    parsePushResult,
  );
}
