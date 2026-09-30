import type { NotificationPolicy } from '../types/group';

export const MIN_GROUP_MEMBERS = 2;
/** Teto técnico para o limite configurável (as regras do Firestore usam o mesmo valor). */
export const MAX_GROUP_LIMIT = 100;
export const MAX_GROUP_NAME_LENGTH = 60;

export const NOTIFICATION_POLICIES: readonly NotificationPolicy[] = [
  'all_group_messages',
  'mentioned_members',
  'direct_messages_only',
  'disabled',
];

export const POLICY_LABELS: Readonly<Record<NotificationPolicy, { title: string; description: string }>> = {
  all_group_messages: {
    title: 'Todas as mensagens',
    description: 'Todos os integrantes, exceto o remetente, recebem push.',
  },
  mentioned_members: {
    title: 'Somente mencionados',
    description: 'Apenas integrantes mencionados ou selecionados como destinatários recebem push.',
  },
  direct_messages_only: {
    title: 'Somente conversas individuais',
    description: 'Mensagens deste grupo não geram push.',
  },
  disabled: {
    title: 'Desativadas',
    description: 'Nenhuma mensagem deste grupo gera push.',
  },
};

export function isNotificationPolicy(value: unknown): value is NotificationPolicy {
  return typeof value === 'string' && (NOTIFICATION_POLICIES as readonly string[]).includes(value);
}

/** Converte o texto digitado em número inteiro, ou `null` se inválido. */
export function parseMemberLimit(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/** Retorna uma mensagem de erro ou `null` quando o limite é válido para a quantidade de integrantes. */
export function validateMemberLimit(limit: number | null, memberCount: number): string | null {
  if (limit === null) {
    return 'Informe um número inteiro válido para o limite.';
  }
  if (limit < MIN_GROUP_MEMBERS) {
    return `O limite mínimo é ${MIN_GROUP_MEMBERS} integrantes.`;
  }
  if (limit > MAX_GROUP_LIMIT) {
    return `O limite máximo permitido é ${MAX_GROUP_LIMIT} integrantes.`;
  }
  if (limit < memberCount) {
    return `O limite não pode ser menor que a quantidade atual de integrantes (${memberCount}).`;
  }
  return null;
}

export function validateGroupName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'Informe o nome do grupo.';
  }
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    return `O nome deve ter no máximo ${MAX_GROUP_NAME_LENGTH} caracteres.`;
  }
  return null;
}

export function validateMemberCount(memberCount: number): string | null {
  if (memberCount < MIN_GROUP_MEMBERS) {
    return 'Selecione pelo menos um integrante além de você.';
  }
  return null;
}

export function availableSlots(memberLimit: number, memberCount: number): number {
  return Math.max(0, memberLimit - memberCount);
}

/** Aplica adições e remoções sem mutar o array original e sem duplicar integrantes. */
export function applyMemberChanges(
  current: readonly string[],
  addIds: readonly string[],
  removeIds: readonly string[],
): string[] {
  const kept = current.filter((id) => !removeIds.includes(id));
  const added = addIds.filter((id) => !kept.includes(id));
  return [...kept, ...added];
}
