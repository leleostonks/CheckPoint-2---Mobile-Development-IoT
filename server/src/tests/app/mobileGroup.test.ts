import assert from 'node:assert/strict';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';

import { loadWithMocks } from '../modules';
import type { UpdateGroupInput } from '../../../../src/types/group';

let attempts = 0;
let failures = 0;
let storedGroup = {
  id: 'g1', name: 'Grupo', photoUrl: '', ownerId: 'alice', memberIds: ['alice', 'bob', 'carol'],
  memberLimit: 3, notificationPolicy: 'all_group_messages', updatedBy: 'alice', createdAt: 1, updatedAt: Date.now() + 10000,
};
const reference = { withConverter: () => reference };
const service = loadWithMocks<{
  removeGroupMember: (groupId: string, uid: string, memberId: string) => Promise<void>;
  updateGroup: (groupId: string, uid: string, input: UpdateGroupInput, photo: null) => Promise<void>;
}>(join(__dirname, '../../../../src/services/groupService.ts'), {
  'firebase/firestore': {
    collection: () => reference, doc: () => reference,
    runTransaction: async (_db: unknown, action: (transaction: {
      get: () => Promise<{ exists: () => boolean; data: () => typeof storedGroup }>;
      update: (_ref: unknown, changes: Partial<typeof storedGroup>) => void;
    }) => Promise<void>) => action({
      get: async () => ({ exists: () => true, data: () => storedGroup }),
      update: (_ref, changes) => { storedGroup = { ...storedGroup, ...changes }; },
    }),
  },
  '/firebase': { firestore: {} },
  '/imageService': { uploadImage: async () => '' },
  '/apiClient': { parseOk: () => true, apiRequest: async () => { attempts++; if (attempts <= failures) throw new Error('Sync indisponível'); return true; } },
});

beforeEach(() => { attempts = 0; failures = 0; storedGroup.memberIds = ['alice', 'bob', 'carol']; storedGroup.updatedAt = Date.now() + 10000; });

describe('cliente: confirmação de acesso do grupo', () => {
  it('repete sincronização que falhou uma vez antes de confirmar', async () => {
    failures = 1;
    await service.removeGroupMember('g1', 'alice', 'bob');
    assert.equal(attempts, 2); assert.deepEqual(storedGroup.memberIds, ['alice', 'carol']);
  });

  it('não confirma remoção quando todas as tentativas de sync falham', async () => {
    failures = 100;
    await assert.rejects(service.removeGroupMember('g1', 'alice', 'bob'), /revogação.*não.*confirmada/i);
    assert.equal(attempts, 3);
  });

  it('remoção incrementa versão mesmo com relógio anterior ao documento', async () => {
    const previous = storedGroup.updatedAt;
    await service.removeGroupMember('g1', 'alice', 'bob');
    assert.ok(storedGroup.updatedAt > previous);
  });

  it('edição incrementa versão mesmo no mesmo milissegundo', async () => {
    const previous = storedGroup.updatedAt;
    await service.updateGroup('g1', 'alice', {
      name: 'Grupo', memberLimit: 3, notificationPolicy: 'all_group_messages', addMemberIds: [], removeMemberIds: ['bob'],
    }, null);
    assert.ok(storedGroup.updatedAt > previous);
  });
});
