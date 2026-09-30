/**
 * URL pública da API de notificações (Vercel).
 * Pode ser sobrescrita pela variável EXPO_PUBLIC_API_URL; o valor padrão deve apontar
 * para a API publicada, para que o app funcione sem configuração extra na correção.
 */
const DEFAULT_API_URL = 'https://check-point-2-mobile-development-io.vercel.app';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');

export const API_TIMEOUT_MS = 20000;

export const MESSAGES_PAGE_SIZE = 200;

export const MAX_MESSAGE_LENGTH = 2000;

export const ANDROID_CHANNEL_ID = 'messages';
