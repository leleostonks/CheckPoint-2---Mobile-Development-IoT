const DIRECT_PREFIX = 'direct_';

/**
 * Gera o identificador único da conversa individual a partir dos dois `uid` ordenados.
 * Assim, o mesmo par de usuários sempre resulta na mesma conversa.
 */
export function buildDirectConversationId(uidA: string, uidB: string): string {
  if (uidA === uidB) {
    throw new Error('Não é possível iniciar uma conversa consigo mesmo.');
  }
  const [first, second] = uidA < uidB ? [uidA, uidB] : [uidB, uidA];
  return `${DIRECT_PREFIX}${first}_${second}`;
}

export function isDirectConversationId(conversationId: string): boolean {
  return conversationId.startsWith(DIRECT_PREFIX);
}

export function parseDirectParticipants(conversationId: string): [string, string] | null {
  if (!isDirectConversationId(conversationId)) {
    return null;
  }
  const parts = conversationId.slice(DIRECT_PREFIX.length).split('_');
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
    return null;
  }
  return [parts[0], parts[1]];
}

export function getOtherParticipant(conversationId: string, myUid: string): string | null {
  const participants = parseDirectParticipants(conversationId);
  if (!participants) {
    return null;
  }
  return participants[0] === myUid ? participants[1] : participants[0];
}
