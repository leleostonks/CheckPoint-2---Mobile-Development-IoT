import {
  groupDocumentSchema,
  parseDirectParticipants,
  type ConversationType,
  type GroupRecord,
  type MessageTarget,
  type NotificationPolicy,
  type StoredMessage,
} from '../domain';
import { HttpError } from '../errors';
import { adminFirestore } from './firebaseAdmin';

export type ResolvedRecipients = {
  conversationType: ConversationType;
  recipientIds: string[];
  policy: NotificationPolicy | 'direct';
  group: GroupRecord | null;
};

type GroupRecipientInput = {
  policy: NotificationPolicy;
  memberIds: readonly string[];
  senderId: string;
  target: MessageTarget;
  mentionedUserIds: readonly string[];
};

/**
 * Regra das políticas de grupo (função pura, coberta por testes):
 * - all_group_messages: todos os integrantes, exceto o remetente;
 * - mentioned_members: apenas mencionados ou o destinatário selecionado;
 * - direct_messages_only e disabled: ninguém.
 * Em todos os casos, somente integrantes atuais e nunca o remetente.
 */
export function computeGroupRecipients(input: GroupRecipientInput): string[] {
  const members = new Set(input.memberIds);
  let candidates: string[];

  switch (input.policy) {
    case 'all_group_messages':
      candidates = [...members];
      break;
    case 'mentioned_members':
      candidates = [
        ...input.mentionedUserIds,
        ...(input.target.type === 'member' ? [input.target.memberId] : []),
      ];
      break;
    case 'direct_messages_only':
    case 'disabled':
      candidates = [];
      break;
  }

  return [...new Set(candidates)].filter((uid) => uid !== input.senderId && members.has(uid));
}

export async function loadGroup(groupId: string): Promise<GroupRecord | null> {
  const snapshot = await adminFirestore().collection('groups').doc(groupId).get();
  if (!snapshot.exists) {
    return null;
  }
  const parsed = groupDocumentSchema.safeParse(snapshot.data());
  if (!parsed.success) {
    throw new HttpError(500, 'Dados do grupo inválidos.');
  }
  return { id: snapshot.id, ...parsed.data };
}

/** Calcula no servidor quem pode receber o push; nunca confia em listas enviadas pelo aplicativo. */
export async function resolveRecipients(conversationId: string, message: StoredMessage): Promise<ResolvedRecipients> {
  const participants = parseDirectParticipants(conversationId);

  if (participants) {
    if (!participants.includes(message.senderId)) {
      throw new HttpError(403, 'O remetente não participa desta conversa.');
    }
    const conversation = await adminFirestore().collection('directConversations').doc(conversationId).get();
    if (!conversation.exists) {
      throw new HttpError(404, 'Conversa não encontrada.');
    }
    return {
      conversationType: 'direct',
      recipientIds: participants.filter((uid) => uid !== message.senderId),
      policy: 'direct',
      group: null,
    };
  }

  const group = await loadGroup(conversationId);
  if (!group) {
    throw new HttpError(404, 'Grupo não encontrado.');
  }
  if (!group.memberIds.includes(message.senderId)) {
    throw new HttpError(403, 'O remetente não é integrante do grupo.');
  }
  return {
    conversationType: 'group',
    recipientIds: computeGroupRecipients({
      policy: group.notificationPolicy,
      memberIds: group.memberIds,
      senderId: message.senderId,
      target: message.target,
      mentionedUserIds: message.mentionedUserIds,
    }),
    policy: group.notificationPolicy,
    group,
  };
}
