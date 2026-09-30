import { createHash } from 'node:crypto';

import type { CloudinaryEnv } from '../env';

export type UploadFolder = 'profiles' | 'groups';

export type UploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  allowedFormats: string;
  signature: string;
};

const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,heic';

/**
 * Assinatura de upload do Cloudinary: SHA-1 dos parâmetros ordenados + API secret.
 * O segredo fica somente na API; o app recebe apenas a assinatura temporária.
 */
export function signUpload(env: CloudinaryEnv, folder: UploadFolder, now: number = Date.now()): UploadSignature {
  const timestamp = Math.floor(now / 1000);
  const params: Record<string, string> = {
    allowed_formats: ALLOWED_FORMATS,
    folder: `chat-firebase/${folder}`,
    timestamp: String(timestamp),
  };
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const signature = createHash('sha1').update(`${toSign}${env.apiSecret}`).digest('hex');

  return {
    cloudName: env.cloudName,
    apiKey: env.apiKey,
    timestamp,
    folder: params.folder,
    allowedFormats: ALLOWED_FORMATS,
    signature,
  };
}
