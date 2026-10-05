import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import type { ChatGroup, CreateGroupInput, UpdateGroupInput } from '../types/group';
import type { PickedImage } from '../types/user';
import { AppError } from '../utils/errorMessages';
import { createReader } from '../utils/firestore';
import {
  applyMemberChanges,
  isNotificationPolicy,
  validateGroupName,
  validateMemberCount,
  validateMemberLimit,
} from '../utils/groupValidation';
import { readNumber, readString, readStringArray, type UnknownRecord } from '../utils/parse';
import { apiRequest, parseOk } from './apiClient';
import { firestore } from './firebase';
import { uploadImage } from './imageService';

type GroupDocument = Omit<ChatGroup, 'id'>;

function toChatGroup(id: string, data: UnknownRecord): ChatGroup {
  const policy = data.notificationPolicy;
  return {
    id,
    name: readString(data, 'name'),
    photoUrl: readString(data, 'photoUrl'),
    ownerId: readString(data, 'ownerId'),
    memberIds: readStringArray(data, 'memberIds'),
    memberLimit: readNumber(data, 'memberLimit'),
    notificationPolicy: isNotificationPolicy(policy) ? policy : 'all_group_messages',
    updatedBy: readString(data, 'updatedBy'),
    createdAt: readNumber(data, 'createdAt'),
    updatedAt: readNumber(data, 'updatedAt'),
  };
}

const groupReader = createReader(toChatGroup);

const groupsCollection = () => collection(firestore, 'groups').withConverter(groupReader);
const groupWriteRef = (groupId: string) => doc(firestore, 'groups', groupId);
const groupDoc = (groupId: string) => groupWriteRef(groupId).withConverter(groupReader);

export function subscribeUserGroups(
  uid: string,
  onChange: (groups: ChatGroup[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const groupsQuery = query(groupsCollection(), where('memberIds', 'array-contains', uid));
  return onSnapshot(groupsQuery, (snapshot) => onChange(snapshot.docs.map((item) => item.data())), onError);
}

export function subscribeGroup(
  groupId: string,
  onChange: (group: ChatGroup | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    groupDoc(groupId),
    (snapshot) => onChange(snapshot.exists() ? snapshot.data() : null),
    onError,
  );
}

/**
 * Pede à API a remoção segura ou o espelhamento de integrantes no Realtime Database.
 * As regras do Realtime Database usam esse espelho para autorizar leitura e envio de mensagens.
 */
async function requestGroupChange(groupId: string, operation: 'sync-members' | 'remove-members', memberIds?: readonly string[]): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await apiRequest(`/groups/${encodeURIComponent(groupId)}/${operation}`, {
        method: 'POST', timeoutMs: 5000, ...(memberIds ? { body: { memberIds } } : {}),
      }, parseOk);
      return;
    } catch {
      if (attempt < 2) await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new AppError(`${operation === 'remove-members' ? 'A remoção' : 'A sincronização'} do grupo falhou: a revogação de acesso não foi confirmada. Verifique sua conexão e tente salvar novamente.`);
}

export async function syncGroupMembers(groupId: string): Promise<void> {
  await requestGroupChange(groupId, 'sync-members');
}

function assertValid(message: string | null): void {
  if (message) {
    throw new AppError(message);
  }
}

export async function createGroup(
  ownerId: string,
  input: CreateGroupInput,
  photo: PickedImage | null,
): Promise<string> {
  const memberIds = applyMemberChanges([ownerId], input.memberIds, []);
  assertValid(validateGroupName(input.name));
  assertValid(validateMemberCount(memberIds.length));
  assertValid(validateMemberLimit(input.memberLimit, memberIds.length));

  const ref = doc(collection(firestore, 'groups'));
  const photoUrl = photo ? await uploadImage(photo, 'groups') : '';
  const now = Date.now();

  await setDoc(ref, {
    name: input.name.trim(),
    photoUrl,
    ownerId,
    memberIds,
    memberLimit: input.memberLimit,
    notificationPolicy: input.notificationPolicy,
    updatedBy: ownerId,
    createdAt: now,
    updatedAt: now,
  } satisfies GroupDocument);

  // O grupo já existe no Firestore: se o espelho falhar agora, a Tela de Chat sincroniza ao abrir.
  // Não relançamos o erro para o usuário não criar um grupo duplicado ao tentar de novo.
  await syncGroupMembers(ref.id).catch(() => undefined);
  return ref.id;
}

/**
 * Atualiza o grupo dentro de uma transação: lê a versão mais recente, aplica as mudanças
 * e valida limite e propriedade. As regras do Firestore repetem as validações no servidor,
 * então nem requisições concorrentes nem clientes modificados conseguem estourar o limite.
 */
export async function updateGroup(
  groupId: string,
  currentUid: string,
  input: UpdateGroupInput,
  newPhoto: PickedImage | null,
): Promise<void> {
  assertValid(validateGroupName(input.name));
  const photoUrl = newPhoto ? await uploadImage(newPhoto, 'groups') : null;

  // A API fecha o RTDB antes de remover no Firestore. O cliente só adiciona/edita depois disso.
  if (input.removeMemberIds.length) await requestGroupChange(groupId, 'remove-members', input.removeMemberIds);

  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(groupDoc(groupId));
    if (!snapshot.exists()) {
      throw new AppError('Grupo não encontrado.');
    }
    const group = snapshot.data();
    if (group.ownerId !== currentUid) {
      throw new AppError('Somente o proprietário pode alterar o grupo.');
    }

    const memberIds = applyMemberChanges(group.memberIds, input.addMemberIds, []);
    const addedCount = memberIds.filter((id) => !group.memberIds.includes(id)).length;

    if (addedCount > 0 && memberIds.length > input.memberLimit) {
      const slots = Math.max(0, input.memberLimit - (memberIds.length - addedCount));
      throw new AppError(
        slots === 0 ? 'O grupo atingiu o limite de integrantes.' : `O grupo só tem ${slots} vaga(s) disponível(is).`,
      );
    }
    assertValid(validateMemberCount(memberIds.length));
    assertValid(validateMemberLimit(input.memberLimit, memberIds.length));

    const changes: Partial<GroupDocument> = {
      name: input.name.trim(),
      memberIds,
      memberLimit: input.memberLimit,
      notificationPolicy: input.notificationPolicy,
      updatedBy: currentUid,
      updatedAt: Math.max(Date.now(), group.updatedAt + 1),
      ...(photoUrl ? { photoUrl } : {}),
    };
    transaction.update(groupWriteRef(groupId), changes);
  });

  // Sempre sincroniza (operação idempotente): se uma tentativa anterior falhou, salvar de novo corrige o espelho.
  await syncGroupMembers(groupId);
}

export async function removeGroupMember(groupId: string, currentUid: string, memberId: string): Promise<void> {
  if (memberId === currentUid) throw new AppError('O proprietário não pode ser removido do grupo.');
  await requestGroupChange(groupId, 'remove-members', [memberId]);
}
