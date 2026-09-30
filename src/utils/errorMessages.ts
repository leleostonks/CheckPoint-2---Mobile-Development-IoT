import { FirebaseError } from 'firebase/app';

import { isRecord } from './parse';

/** Erros de domínio lançados pelos services, com mensagem já pronta para o usuário. */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

const FIREBASE_MESSAGES: Readonly<Record<string, string>> = {
  'auth/invalid-credential': 'E-mail ou senha inválidos.',
  'auth/invalid-login-credentials': 'E-mail ou senha inválidos.',
  'auth/wrong-password': 'E-mail ou senha inválidos.',
  'auth/user-not-found': 'E-mail ou senha inválidos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
  'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'auth/user-token-expired': 'Sua sessão expirou. Entre novamente.',
  'auth/requires-recent-login': 'Sua sessão expirou. Entre novamente.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'permission-denied': 'Você não tem permissão para realizar esta ação.',
  PERMISSION_DENIED: 'Você não tem permissão para realizar esta ação.',
  unavailable: 'Serviço indisponível. Verifique sua conexão.',
  'deadline-exceeded': 'A operação demorou demais. Tente novamente.',
  'failed-precondition': 'A operação não pôde ser concluída. Tente novamente.',
  aborted: 'Outra alteração foi feita ao mesmo tempo. Tente novamente.',
  'not-found': 'Registro não encontrado.',
};

function extractCode(error: unknown): string | null {
  if (error instanceof FirebaseError) {
    return error.code;
  }
  if (isRecord(error) && typeof error.code === 'string') {
    return error.code;
  }
  return null;
}

export function isPermissionDenied(error: unknown): boolean {
  const code = extractCode(error);
  if (code === 'permission-denied' || code === 'PERMISSION_DENIED') {
    return true;
  }
  return error instanceof Error && error.message.toLowerCase().includes('permission_denied');
}

/** Converte qualquer erro em uma mensagem compreensível, sem expor detalhes internos. */
export function getErrorMessage(error: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (isPermissionDenied(error)) {
    return FIREBASE_MESSAGES['permission-denied'];
  }
  const code = extractCode(error);
  if (code && FIREBASE_MESSAGES[code]) {
    return FIREBASE_MESSAGES[code];
  }
  if (error instanceof TypeError && error.message.includes('Network request failed')) {
    return 'Sem conexão com a internet.';
  }
  return fallback;
}
