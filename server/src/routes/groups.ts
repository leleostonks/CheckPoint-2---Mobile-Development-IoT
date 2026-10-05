import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { firebaseKeySchema, groupDocumentSchema, type GroupRecord } from '../domain';
import { HttpError } from '../errors';
import { authenticate, getAuthenticatedUid } from '../middleware/authenticate';
import { adminDatabase, adminFirestore } from '../services/firebaseAdmin';
import { loadGroup } from '../services/recipientResolver';
import { restoreMembershipMirror, revokeMembershipMirror, syncMembershipMirror } from '../services/membershipMirror';

export const groupsRouter = Router();

/**
 * POST /groups/:groupId/sync-members
 * O Firestore é a fonte da verdade dos integrantes. As regras do Realtime Database não leem o Firestore,
 * então a API espelha os integrantes em `conversationMembers/{groupId}` (gravável apenas pelo Admin SDK).
 */
groupsRouter.post('/groups/:groupId/sync-members', authenticate, async (req, res) => {
  const uid = getAuthenticatedUid(res);
  const groupId = firebaseKeySchema.parse(req.params.groupId);
  const mirrorRef = adminDatabase().ref(`conversationMembers/${groupId}`);

  const group = await loadGroup(groupId);
  if (!group) {
    await mirrorRef.remove();
    throw new HttpError(404, 'Grupo não encontrado.');
  }
  if (!group.memberIds.includes(uid)) {
    throw new HttpError(403, 'Você não é integrante deste grupo.');
  }

  // A transação aceita apenas versões mais novas; uma sincronização atrasada não desfaz remoções.
  await syncMembershipMirror(group);
  res.json({ ok: true, members: group.memberIds.length });
});

const removalSchema = z.object({
  memberIds: z.array(firebaseKeySchema).min(1).max(100),
  addMemberIds: z.array(firebaseKeySchema).max(100).default([]),
  memberLimit: z.number().optional(),
});

function validateMembershipChange(group: GroupRecord, uid: string, removeMemberIds: string[], addMemberIds: string[], requestedLimit?: number): { memberIds: string[]; memberLimit: number } {
  if (group.ownerId !== uid) throw new HttpError(403, 'Somente o proprietário pode remover integrantes.');
  if (removeMemberIds.includes(group.ownerId)) throw new HttpError(400, 'O proprietário não pode ser removido do grupo.');
  const memberIds = [...new Set([...group.memberIds.filter((memberId) => !removeMemberIds.includes(memberId)), ...addMemberIds])];
  const memberLimit = requestedLimit ?? group.memberLimit;
  // O mínimo e a capacidade valem para a seleção final, permitindo substituição sem estado intermediário.
  if (memberIds.length < 2) throw new HttpError(400, 'O grupo precisa ter pelo menos dois integrantes.');
  if (!memberIds.includes(group.ownerId)) throw new HttpError(400, 'O proprietário precisa permanecer no grupo.');
  if (!Number.isInteger(memberLimit) || memberLimit < 2 || memberLimit > 100) throw new HttpError(400, 'O limite precisa ser um inteiro entre 2 e 100.');
  if (memberIds.length > memberLimit) throw new HttpError(400, 'O limite não pode ser menor que a quantidade final de integrantes.');
  return { memberIds, memberLimit };
}

/** Remoção é exclusiva da API: primeiro fecha RTDB, depois confirma Firestore e sincroniza a versão. */
groupsRouter.post('/groups/:groupId/remove-members', authenticate, async (req, res) => {
  const uid = getAuthenticatedUid(res);
  const groupId = firebaseKeySchema.parse(req.params.groupId);
  const input = removalSchema.parse(req.body);
  const memberIds = [...new Set(input.memberIds)];
  const addMemberIds = [...new Set(input.addMemberIds)];
  const group = await loadGroup(groupId);
  if (!group) throw new HttpError(404, 'Grupo não encontrado.');
  validateMembershipChange(group, uid, memberIds, addMemberIds, input.memberLimit);
  // Chaves reservadas não são integrantes; nunca as usamos como entradas de remoção.
  if ([...memberIds, ...addMemberIds].some((memberId) => memberId.startsWith('_'))) throw new HttpError(400, 'Identificador de integrante inválido.');

  const operationId = randomUUID();
  await revokeMembershipMirror(group, memberIds, operationId);
  let updated: GroupRecord;
  try {
    const db = adminFirestore(); const ref = db.collection('groups').doc(groupId);
    updated = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new HttpError(404, 'Grupo não encontrado.');
      const current = { id: groupId, ...groupDocumentSchema.parse(snapshot.data()) };
      const membership = validateMembershipChange(current, uid, memberIds, addMemberIds, input.memberLimit);
      // A seleção do app vem de publicProfiles; o Admin também confere os novos integrantes no mesmo commit.
      const added = membership.memberIds.filter((memberId) => !current.memberIds.includes(memberId));
      const profiles = await Promise.all(added.map((memberId) => transaction.get(db.collection('publicProfiles').doc(memberId))));
      if (profiles.some((profile) => !profile.exists)) throw new HttpError(400, 'Integrante selecionado não encontrado.');
      const changes = { ...membership, updatedBy: uid, updatedAt: Math.max(Date.now(), current.updatedAt + 1) };
      transaction.update(ref, changes);
      // Prova privada no mesmo commit: permite limpar esta operação mesmo se o sync final falhar.
      transaction.set(db.collection('membershipRemovals').doc(operationId), { groupId, updatedAt: changes.updatedAt });
      return { ...current, ...changes };
    });
  } catch (error) {
    // A restauração consulta o Firestore atual; não reutiliza o snapshot anterior à transação.
    try {
      let restored = false;
      for (let attempt = 0; attempt < 3 && !restored; attempt++) {
        const current = await loadGroup(groupId);
        if (!current) { await adminDatabase().ref(`conversationMembers/${groupId}`).remove(); restored = true; }
        else restored = await restoreMembershipMirror(current, operationId);
      }
      if (!restored) throw new Error('Versão concorrente durante restauração.');
    } catch {
      // Mantém o acesso fechado se a própria restauração estiver indisponível.
      throw new HttpError(503, 'A remoção falhou e a restauração de acesso não foi confirmada. Tente novamente.');
    }
    throw error;
  }
  // Outra sessão pode ter editado ou readicionado integrantes depois do commit.
  const current = await loadGroup(groupId);
  await syncMembershipMirror(current ?? updated);
  res.json({ ok: true, members: (current ?? updated).memberIds.length });
});
