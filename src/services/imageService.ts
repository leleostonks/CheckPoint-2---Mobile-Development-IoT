import * as ImagePicker from 'expo-image-picker';

import type { PickedImage } from '../types/user';
import { AppError } from '../utils/errorMessages';
import { isRecord } from '../utils/parse';
import { ApiError, apiRequest } from './apiClient';

export type ImageFolder = 'profiles' | 'groups';

type UploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  allowedFormats: string;
  signature: string;
};

function parseSignature(body: unknown): UploadSignature {
  if (
    isRecord(body) &&
    typeof body.cloudName === 'string' &&
    typeof body.apiKey === 'string' &&
    typeof body.timestamp === 'number' &&
    typeof body.folder === 'string' &&
    typeof body.allowedFormats === 'string' &&
    typeof body.signature === 'string'
  ) {
    return {
      cloudName: body.cloudName,
      apiKey: body.apiKey,
      timestamp: body.timestamp,
      folder: body.folder,
      allowedFormats: body.allowedFormats,
      signature: body.signature,
    };
  }
  throw new ApiError('Resposta inesperada do servidor de imagens.', 500);
}

/**
 * Abre a galeria para o usuário escolher uma foto quadrada.
 * Retorna `null` se o usuário cancelar; lança erro se a permissão for negada.
 */
export async function pickSquareImage(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new AppError('Permita o acesso às fotos nas configurações do aparelho para escolher uma imagem.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.4,
    base64: true,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset.base64) {
    throw new AppError('Não foi possível ler a imagem selecionada.');
  }

  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: asset.mimeType ?? 'image/jpeg',
  };
}

/**
 * Envia a imagem ao Cloudinary com upload assinado pela API (o segredo nunca fica no app)
 * e retorna a URL final, que é a única informação gravada no Firestore.
 */
export async function uploadImage(image: PickedImage, folder: ImageFolder): Promise<string> {
  const signature = await apiRequest('/uploads/signature', { method: 'POST', body: { folder } }, parseSignature);

  const form = new FormData();
  form.append('file', `data:${image.mimeType};base64,${image.base64}`);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('folder', signature.folder);
  form.append('allowed_formats', signature.allowedFormats);
  form.append('signature', signature.signature);

  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });
  } catch {
    throw new AppError('Falha de conexão ao enviar a imagem.');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(body) || typeof body.secure_url !== 'string') {
    throw new AppError('Não foi possível enviar a imagem. Tente outra foto.');
  }
  return body.secure_url;
}
