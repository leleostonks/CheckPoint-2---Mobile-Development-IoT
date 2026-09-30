import { z } from 'zod';

export const NOTIFICATION_POLICIES = [
  'all_group_messages',
  'mentioned_members',
  'direct_messages_only',
  'disabled',
] as const;

export type NotificationPolicy = (typeof NOTIFICATION_POLICIES)[number];
export type ConversationType = 'direct' | 'group';

export type MessageTarget = { type: 'conversation' } | { type: 'member'; memberId: string };

/** Mensagem como está gravada no Realtime Database. */
export type StoredMessage = {
  conversationId: string;
  conversationType: ConversationType;
  senderId: string;
  text: string;
  target: MessageTarget;
  mentionedUserIds: string[];
  createdAt: number;
};

export type GroupRecord = {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  memberLimit: number;
  notificationPolicy: NotificationPolicy;
};

/** Ids aceitos em caminhos do Firebase: sem `.`, `#`, `$`, `[`, `]` ou `/`. */
export const firebaseKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^.#$[\]/]+$/, 'Identificador inválido.');

const stringList = z
  .union([z.array(z.string()), z.record(z.string(), z.string())])
  .transform((value) => (Array.isArray(value) ? value : Object.values(value)));

export const storedMessageSchema = z.object({
  conversationId: z.string(),
  conversationType: z.enum(['direct', 'group']),
  senderId: z.string(),
  text: z.string(),
  target: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('conversation') }),
      z.object({ type: z.literal('member'), memberId: z.string() }),
    ])
    .default({ type: 'conversation' }),
  // O Realtime Database não grava listas vazias; ausência equivale a [].
  mentionedUserIds: stringList.default([]),
  createdAt: z.number(),
});

export const groupDocumentSchema = z.object({
  name: z.string(),
  ownerId: z.string(),
  memberIds: z.array(z.string()),
  memberLimit: z.number().int(),
  notificationPolicy: z.enum(NOTIFICATION_POLICIES).catch('all_group_messages'),
});

const DIRECT_PREFIX = 'direct_';

export function buildDirectConversationId(uidA: string, uidB: string): string {
  const [first, second] = uidA < uidB ? [uidA, uidB] : [uidB, uidA];
  return `${DIRECT_PREFIX}${first}_${second}`;
}

/** Retorna os dois participantes de uma conversa individual, ou `null` se o id não for válido. */
export function parseDirectParticipants(conversationId: string): [string, string] | null {
  if (!conversationId.startsWith(DIRECT_PREFIX)) {
    return null;
  }
  const parts = conversationId.slice(DIRECT_PREFIX.length).split('_');
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] >= parts[1]) {
    return null;
  }
  return [parts[0], parts[1]];
}
