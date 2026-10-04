import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import type { ChatUser, PublicProfile } from '../types/user';
import { AppError } from '../utils/errorMessages';
import { createReader } from '../utils/firestore';
import { isRecord, readNumber, readString, type UnknownRecord } from '../utils/parse';
import { ApiError, apiRequest } from './apiClient';
import { firestore } from './firebase';

/** Documento `users/{uid}` — dados cadastrais completos, legíveis apenas pelo próprio usuário. */
export type UserDocument = Omit<ChatUser, 'uid'>;

/** Documento `publicProfiles/{uid}` — nome e foto, legíveis por usuários autenticados. */
export type PublicProfileDocument = Omit<PublicProfile, 'uid'> & { nameLower: string };

export function toChatUser(uid: string, data: UnknownRecord): ChatUser {
  return {
    uid,
    name: readString(data, 'name'),
    email: readString(data, 'email'),
    phoneNumber: readString(data, 'phoneNumber'),
    birthDate: readString(data, 'birthDate'),
    photoUrl: readString(data, 'photoUrl'),
    createdAt: readNumber(data, 'createdAt'),
  };
}

const userReader = createReader(toChatUser);

const publicProfileReader = createReader<PublicProfile>((uid, data) => ({
  uid,
  name: readString(data, 'name'),
  photoUrl: readString(data, 'photoUrl'),
}));

/** Referências sem conversor, usadas nas gravações. */
export const userWriteRef = (uid: string) => doc(firestore, 'users', uid);
export const publicProfileWriteRef = (uid: string) => doc(firestore, 'publicProfiles', uid);

const userDoc = (uid: string) => userWriteRef(uid).withConverter(userReader);
const publicProfileDoc = (uid: string) => publicProfileWriteRef(uid).withConverter(publicProfileReader);
const publicProfilesCollection = () => collection(firestore, 'publicProfiles').withConverter(publicProfileReader);

export function subscribeOwnProfile(
  uid: string,
  onChange: (user: ChatUser | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    userDoc(uid),
    { includeMetadataChanges: true },
    (snapshot: DocumentSnapshot<ChatUser>) => {
      // Sem conexão, o cache pode responder "não existe" antes do servidor; só o servidor confirma a ausência.
      if (!snapshot.exists() && snapshot.metadata.fromCache) {
        return;
      }
      onChange(snapshot.exists() ? snapshot.data() : null);
    },
    onError,
  );
}

export function subscribePublicProfiles(
  onChange: (profiles: PublicProfile[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const profilesQuery = query(publicProfilesCollection(), orderBy('nameLower'), limit(500));
  return onSnapshot(
    profilesQuery,
    (snapshot) => onChange(snapshot.docs.map((item) => item.data())),
    onError,
  );
}

export async function getPublicProfile(uid: string): Promise<PublicProfile | null> {
  const snapshot = await getDoc(publicProfileDoc(uid));
  return snapshot.exists() ? snapshot.data() : null;
}

function parseProfileResponse(body: unknown): ChatUser {
  if (isRecord(body) && isRecord(body.profile) && typeof body.profile.uid === 'string') {
    return toChatUser(body.profile.uid, body.profile);
  }
  throw new ApiError('Resposta inesperada do servidor.', 500);
}

/**
 * Busca os dados cadastrais de um usuário.
 * O próprio perfil vem do Firestore; perfis de terceiros passam pela API, que confirma
 * se existe conversa individual ou grupo em comum (verificação que as regras não conseguem fazer sozinhas).
 */
export async function fetchUserProfile(uid: string, currentUid: string): Promise<ChatUser> {
  if (uid === currentUid) {
    const snapshot = await getDoc(userDoc(uid));
    if (!snapshot.exists()) {
      throw new AppError('Perfil não encontrado.');
    }
    return snapshot.data();
  }
  return apiRequest(`/profiles/${encodeURIComponent(uid)}`, { method: 'GET' }, parseProfileResponse);
}
