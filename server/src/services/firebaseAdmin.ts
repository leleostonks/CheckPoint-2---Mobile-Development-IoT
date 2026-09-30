import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

import { readFirebaseEnv } from '../env';

let app: App | null = null;

/** Inicialização preguiçosa: o /health continua respondendo mesmo se as credenciais faltarem. */
function getAdminApp(): App {
  if (app) {
    return app;
  }
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }
  const env = readFirebaseEnv();
  app = initializeApp({
    credential: cert({
      projectId: env.projectId,
      clientEmail: env.clientEmail,
      privateKey: env.privateKey,
    }),
    databaseURL: env.databaseURL,
  });
  return app;
}

export const adminAuth = (): Auth => getAuth(getAdminApp());
export const adminFirestore = (): Firestore => getFirestore(getAdminApp());
export const adminDatabase = (): Database => getDatabase(getAdminApp());
export const adminMessaging = (): Messaging => getMessaging(getAdminApp());
