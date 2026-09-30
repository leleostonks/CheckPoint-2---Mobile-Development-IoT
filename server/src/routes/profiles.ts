import { Router } from 'express';
import { z } from 'zod';

import { buildDirectConversationId, firebaseKeySchema } from '../domain';
import { HttpError } from '../errors';
import { authenticate, getAuthenticatedUid } from '../middleware/authenticate';
import { adminFirestore } from '../services/firebaseAdmin';

const profileSchema = z.object({
  name: z.string().catch(''),
  email: z.string().catch(''),
  phoneNumber: z.string().catch(''),
  birthDate: z.string().catch(''),
  photoUrl: z.string().catch(''),
  createdAt: z.number().catch(0),
});

/** Existe conversa individual ou grupo em comum entre os dois usuários? */
async function sharesConversation(requesterId: string, targetId: string): Promise<boolean> {
  const db = adminFirestore();
  const direct = await db.collection('directConversations').doc(buildDirectConversationId(requesterId, targetId)).get();
  if (direct.exists) {
    return true;
  }
  const groups = await db.collection('groups').where('memberIds', 'array-contains', requesterId).get();
  return groups.docs.some((doc) => {
    const memberIds: unknown = doc.get('memberIds');
    return Array.isArray(memberIds) && memberIds.includes(targetId);
  });
}

export const profilesRouter = Router();

/**
 * GET /profiles/:uid
 * Dados cadastrais só são entregues a quem compartilha uma conversa individual ou um grupo com o perfil.
 */
profilesRouter.get('/profiles/:uid', authenticate, async (req, res) => {
  const requesterId = getAuthenticatedUid(res);
  const targetId = firebaseKeySchema.parse(req.params.uid);

  if (requesterId !== targetId && !(await sharesConversation(requesterId, targetId))) {
    throw new HttpError(403, 'Você só pode ver o perfil de quem participa de uma conversa com você.');
  }

  const snapshot = await adminFirestore().collection('users').doc(targetId).get();
  if (!snapshot.exists) {
    throw new HttpError(404, 'Perfil não encontrado.');
  }
  const profile = profileSchema.parse(snapshot.data() ?? {});
  res.json({ profile: { uid: targetId, ...profile } });
});
