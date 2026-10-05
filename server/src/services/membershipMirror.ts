import type { GroupRecord } from '../domain';
import { isRecord } from '../errors';
import { adminDatabase } from './firebaseAdmin';

/** Mapa plano compatível com regras antigas; `_version` não é uid de e-mail/senha. */
export async function syncMembershipMirror(group: GroupRecord): Promise<void> {
  await adminDatabase().ref(`conversationMembers/${group.id}`).transaction((current: unknown) => {
    const version = isRecord(current) && typeof current._version === 'number' ? current._version : -1;
    // Uma requisição atrasada nunca restaura a lista de uma versão anterior.
    if (version >= group.updatedAt) return undefined;
    return {
      ...Object.fromEntries(group.memberIds.map((uid) => [uid, true])),
      _version: group.updatedAt,
    };
  }, undefined, false);
}
