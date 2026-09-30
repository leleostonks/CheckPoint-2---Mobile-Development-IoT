import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import { writeBatch } from 'firebase/firestore';

import type { RegisterInput } from '../types/user';
import { auth, firestore } from './firebase';
import { uploadImage } from './imageService';
import {
  publicProfileWriteRef,
  userWriteRef,
  type PublicProfileDocument,
  type UserDocument,
} from './userService';

export type RegisterResult = {
  photoUploadFailed: boolean;
};

export function observeAuthState(listener: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, listener);
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

/**
 * Cria a conta no Firebase Authentication e grava o perfil no Firestore.
 * Se o perfil não puder ser gravado, a conta recém-criada é removida para permitir nova tentativa.
 */
export async function registerAccount(input: RegisterInput): Promise<RegisterResult> {
  const credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  const { uid } = credential.user;

  let photoUrl = '';
  let photoUploadFailed = false;
  if (input.photo) {
    try {
      photoUrl = await uploadImage(input.photo, 'profiles');
    } catch {
      photoUploadFailed = true;
    }
  }

  const name = input.name.trim();
  try {
    const batch = writeBatch(firestore);
    batch.set(userWriteRef(uid), {
      name,
      email: input.email.trim().toLowerCase(),
      phoneNumber: input.phoneNumber,
      birthDate: input.birthDate,
      photoUrl,
      createdAt: Date.now(),
    } satisfies UserDocument);
    batch.set(publicProfileWriteRef(uid), {
      name,
      nameLower: name.toLowerCase(),
      photoUrl,
    } satisfies PublicProfileDocument);
    await batch.commit();
  } catch (error) {
    await deleteUser(credential.user).catch(() => undefined);
    throw error;
  }

  return { photoUploadFailed };
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}
