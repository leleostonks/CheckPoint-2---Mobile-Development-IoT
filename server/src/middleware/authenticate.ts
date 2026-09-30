import type { NextFunction, Request, Response } from 'express';

import { HttpError } from '../errors';
import { adminAuth } from '../services/firebaseAdmin';

/** Valida o Firebase ID Token enviado em `Authorization: Bearer <token>`. */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    throw new HttpError(401, 'Token de autenticação ausente.');
  }
  // Fora do try: credenciais ausentes geram ConfigError (503), não "sessão inválida".
  const auth = adminAuth();
  try {
    const decoded = await auth.verifyIdToken(match[1]);
    res.locals.uid = decoded.uid;
  } catch {
    throw new HttpError(401, 'Sessão inválida ou expirada. Entre novamente.');
  }
  next();
}

/** Uid do usuário autenticado pelo middleware. */
export function getAuthenticatedUid(res: Response): string {
  const uid: unknown = res.locals.uid;
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new HttpError(401, 'Usuário não autenticado.');
  }
  return uid;
}
