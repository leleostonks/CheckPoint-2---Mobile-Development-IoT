import type { Request, RequestHandler, Response } from 'express';
import { initializeApp } from 'firebase-admin/app';

import { groupsRouter } from '../routes/groups';

/** Executa o handler real; a autenticação é substituída apenas por um uid sintético no teste. */
export async function callGroupSync(groupId: string, uid: string): Promise<void> {
  const stack = groupsRouter.stack as unknown as { route?: { path: string; stack: { handle: RequestHandler }[] } }[];
  const layer = stack.find((item) => item.route?.path === '/groups/:groupId/sync-members');
  if (!layer?.route) {
    throw new Error('Rota de sincronização não encontrada.');
  }
  const handler = layer.route.stack[1].handle;
  await handler({ params: { groupId } } as unknown as Request, {
    locals: { uid },
    json: () => undefined,
  } as unknown as Response, () => undefined);
}

/** Não inicializa Admin SDK sem os dois hosts explícitos dos emuladores. */
export function initializeDemoAdmin() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9000') {
    throw new Error('Este helper exige os emuladores locais.');
  }
  return initializeApp({ projectId: 'demo-chat', databaseURL: 'https://demo-chat.firebaseio.com' });
}
