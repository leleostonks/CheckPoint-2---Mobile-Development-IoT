import type { GroupRecord } from '../domain';
import { isRecord } from '../errors';
import { adminDatabase, adminFirestore } from './firebaseAdmin';

// Folga sobre os 300 s padrão da Vercel: a função precisa terminar antes destes 15 min.
// Reavaliar este prazo se a duração máxima da função for aumentada.
const REMOVAL_ABANDONMENT_TIMEOUT_MS = 15 * 60 * 1000;

/** Operações pendentes são metadados reservados, nunca entradas de autorização. */
function pendingRemovals(current: unknown): Record<string, unknown> {
  return isRecord(current) && isRecord(current._removals) ? current._removals : {};
}

/** Só libera operações com commit comprovado ou sem prova após a vida máxima da função. */
async function releasableRemovals(group: GroupRecord): Promise<Set<string>> {
  const current: unknown = (await adminDatabase().ref(`conversationMembers/${group.id}`).get()).val();
  const completed = new Set<string>();
  const abandonedBefore = Date.now() - REMOVAL_ABANDONMENT_TIMEOUT_MS;
  await Promise.all(Object.entries(pendingRemovals(current)).map(async ([operationId, value]) => {
    const snapshot = await adminFirestore().collection('membershipRemovals').doc(operationId).get();
    const version: unknown = snapshot.get('updatedAt');
    if (snapshot.exists && snapshot.get('groupId') === group.id && typeof version === 'number' && version <= group.updatedAt) {
      completed.add(operationId);
    } else if (!snapshot.exists && isRecord(value) && typeof value.startedAt === 'number'
      && Number.isFinite(value.startedAt) && value.startedAt > 0 && value.startedAt < abandonedBefore) {
      // Sem data válida (legado), não há como provar abandono: preserva a pré-revogação.
      completed.add(operationId);
    }
  }));
  return completed;
}

function mirrorValue(group: GroupRecord, pending: Record<string, unknown>, completed: ReadonlySet<string>): Record<string, unknown> {
  const remaining: Record<string, unknown> = {};
  const blocked = new Set<string>();
  for (const [operationId, value] of Object.entries(pending)) {
    if (completed.has(operationId) || !isRecord(value)) continue;
    const members = isRecord(value.members) ? value.members : value;
    const ids = Object.keys(members).filter((uid) => members[uid] === true);
    if (ids.length) remaining[operationId] = value;
    ids.forEach((uid) => blocked.add(uid));
  }
  return {
    ...Object.fromEntries(group.memberIds.filter((uid) => !blocked.has(uid)).map((uid) => [uid, true])),
    _version: group.updatedAt,
    ...(Object.keys(remaining).length ? { _removals: remaining } : {}),
  };
}

/** Mapa plano compatível com regras antigas; `_version` não é uid de e-mail/senha. */
export async function syncMembershipMirror(group: GroupRecord): Promise<void> {
  const completed = await releasableRemovals(group);
  await adminDatabase().ref(`conversationMembers/${group.id}`).transaction((current: unknown) => {
    const version = isRecord(current) && typeof current._version === 'number' ? current._version : -1;
    // Uma requisição atrasada nunca restaura a lista de uma versão anterior.
    if (version > group.updatedAt) return undefined;
    const pending = pendingRemovals(current);
    // Na versão igual só limpamos operações concluídas/abandonadas, sem mudar a versão.
    if (version === group.updatedAt && !Object.keys(pending).some((id) => completed.has(id))) return undefined;
    return mirrorValue(group, pending, completed);
  }, undefined, false);
}

/** Pré-revoga sem mudar a versão; sync de edição concorrente também respeita a remoção pendente. */
export async function revokeMembershipMirror(group: GroupRecord, memberIds: string[], operationId: string): Promise<void> {
  const startedAt = Date.now();
  await adminDatabase().ref(`conversationMembers/${group.id}`).transaction((current: unknown) => {
    const next = isRecord(current) ? { ...current } : {};
    const pending = { ...pendingRemovals(current), [operationId]: { startedAt, members: Object.fromEntries(memberIds.map((uid) => [uid, true])) } };
    memberIds.forEach((uid) => { delete next[uid]; });
    return { ...next, _removals: pending };
  }, undefined, false);
}

/** Rollback explícito: a versão igual precisa poder restaurar a pré-revogação que não teve commit. */
export async function restoreMembershipMirror(group: GroupRecord, operationId: string): Promise<boolean> {
  const completed = await releasableRemovals(group);
  completed.add(operationId);
  const result = await adminDatabase().ref(`conversationMembers/${group.id}`).transaction((current: unknown) => {
    const version = isRecord(current) && typeof current._version === 'number' ? current._version : -1;
    if (version > group.updatedAt) return undefined;
    return mirrorValue(group, pendingRemovals(current), completed);
  }, undefined, false);
  return result.committed;
}
