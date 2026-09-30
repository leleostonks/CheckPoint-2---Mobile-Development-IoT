/**
 * Funções de leitura segura para dados vindos do Firebase e da API.
 * Os SDKs retornam `unknown`/`DocumentData`; aqui convertemos para tipos fortes sem usar `any`.
 */

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(source: UnknownRecord, key: string, fallback = ''): string {
  const value = source[key];
  return typeof value === 'string' ? value : fallback;
}

export function readNumber(source: UnknownRecord, key: string, fallback = 0): number {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readBoolean(source: UnknownRecord, key: string, fallback = false): boolean {
  const value = source[key];
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * O Realtime Database pode devolver listas como array ou como objeto de índices numéricos.
 * Ambos os formatos são aceitos.
 */
export function readStringArray(source: UnknownRecord, key: string): string[] {
  const value = source[key];
  const items: unknown[] = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  return items.filter((item): item is string => typeof item === 'string');
}

export function readRecord(source: UnknownRecord, key: string): UnknownRecord | null {
  const value = source[key];
  return isRecord(value) ? value : null;
}
