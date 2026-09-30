import { ConfigError } from './errors';

export type FirebaseAdminEnv = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  databaseURL: string;
};

export type CloudinaryEnv = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Credenciais administrativas: existem somente nas variáveis secretas da hospedagem. */
export function readFirebaseEnv(): FirebaseAdminEnv {
  const projectId = read('FIREBASE_PROJECT_ID');
  const clientEmail = read('FIREBASE_CLIENT_EMAIL');
  // A chave costuma ser colada com "\n" literais; convertemos para quebras de linha reais.
  const privateKey = read('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
  const databaseURL = read('FIREBASE_DATABASE_URL');

  const missing = [
    ['FIREBASE_PROJECT_ID', projectId],
    ['FIREBASE_CLIENT_EMAIL', clientEmail],
    ['FIREBASE_PRIVATE_KEY', privateKey],
    ['FIREBASE_DATABASE_URL', databaseURL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (!projectId || !clientEmail || !privateKey || !databaseURL) {
    throw new ConfigError(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
  }
  return { projectId, clientEmail, privateKey, databaseURL };
}

export function readCloudinaryEnv(): CloudinaryEnv | null {
  const cloudName = read('CLOUDINARY_CLOUD_NAME');
  const apiKey = read('CLOUDINARY_API_KEY');
  const apiSecret = read('CLOUDINARY_API_SECRET');
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

export function isFirebaseConfigured(): boolean {
  try {
    readFirebaseEnv();
    return true;
  } catch {
    return false;
  }
}
