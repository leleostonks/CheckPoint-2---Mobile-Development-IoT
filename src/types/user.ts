/** Perfil completo, gravado em `users/{uid}` (acesso restrito). */
export type ChatUser = {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  birthDate: string;
  photoUrl: string;
  createdAt: number;
};

/** Dados mínimos, gravados em `publicProfiles/{uid}`, usados para listar e buscar usuários. */
export type PublicProfile = {
  uid: string;
  name: string;
  photoUrl: string;
};

export type PickedImage = {
  uri: string;
  base64: string;
  mimeType: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  birthDate: string;
  photo: PickedImage | null;
};

export type ProfilesById = Readonly<Record<string, PublicProfile>>;
