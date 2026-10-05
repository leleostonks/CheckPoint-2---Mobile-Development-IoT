import { Router } from 'express';

import { firebaseKeySchema } from '../domain';
import { HttpError } from '../errors';
import { authenticate, getAuthenticatedUid } from '../middleware/authenticate';
import { adminDatabase } from '../services/firebaseAdmin';
import { loadGroup } from '../services/recipientResolver';
import { syncMembershipMirror } from '../services/membershipMirror';

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
