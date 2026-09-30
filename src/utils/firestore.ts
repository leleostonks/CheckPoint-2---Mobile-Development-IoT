import type { DocumentData, FirestoreDataConverter, QueryDocumentSnapshot } from 'firebase/firestore';

import type { UnknownRecord } from './parse';

/**
 * Conversor usado apenas em leituras: transforma o documento em um tipo forte.
 * As gravações usam referências sem conversor e objetos tipados com `satisfies`.
 */
export function createReader<T>(parse: (id: string, data: UnknownRecord) => T): FirestoreDataConverter<T, DocumentData> {
  return {
    toFirestore: () => {
      throw new Error('Conversor somente leitura: grave usando a referência sem conversor.');
    },
    fromFirestore: (snapshot: QueryDocumentSnapshot) => parse(snapshot.id, snapshot.data()),
  };
}
