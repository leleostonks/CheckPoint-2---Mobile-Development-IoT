import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { getFirestore, type Firestore } from 'firebase/firestore';

import firebaseConfigJson from '../../firebaseConfig.json';

const firebaseConfig: FirebaseOptions = firebaseConfigJson;

if (firebaseConfig.apiKey?.startsWith('PREENCHER')) {
  throw new Error(
    'Configure o arquivo firebaseConfig.json com os dados do seu projeto Firebase (veja o README).',
  );
}

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function createAuth(): Auth {
  try {
    // Persiste a sessão entre aberturas do app.
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Fast Refresh: o Auth já foi inicializado nesta instância.
    return getAuth(app);
  }
}

export const firebaseApp: FirebaseApp = app;
export const auth: Auth = createAuth();
export const firestore: Firestore = getFirestore(app);
export const realtimeDb: Database = getDatabase(app);
