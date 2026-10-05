import { API_TIMEOUT_MS, API_URL } from '../config';
import { AppError } from '../utils/errorMessages';
import { isRecord } from '../utils/parse';
import { auth } from './firebase';

type HttpMethod = 'GET' | 'POST';

type RequestOptions = {
  method: HttpMethod;
  body?: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
};

export class ApiError extends AppError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function extractApiMessage(body: unknown): string | null {
  return isRecord(body) && typeof body.error === 'string' ? body.error : null;
}

/**
 * Chama a API online enviando o Firebase ID Token no cabeçalho Authorization.
 * `parse` converte o JSON recebido (unknown) no tipo esperado.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions,
  parse: (body: unknown) => T,
): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError('Sua sessão expirou. Entre novamente.', 401);
  }

  const idToken = await user.getIdToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão.', 0);
  } finally {
    clearTimeout(timeout);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const fallback =
      response.status === 401 ? 'Sua sessão expirou. Entre novamente.' : 'O servidor não conseguiu concluir a operação.';
    throw new ApiError(extractApiMessage(body) ?? fallback, response.status);
  }

  return parse(body);
}

export function parseOk(body: unknown): true {
  if (isRecord(body) && body.ok === true) {
    return true;
  }
  throw new ApiError('Resposta inesperada do servidor.', 500);
}
