import assert from 'node:assert/strict';
import { once } from 'node:events';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import express from 'express';

import { loadWithMocks } from '../tests/modules';

type RecordData = Record<string, unknown>;
type Document = ReturnType<typeof doc>;
const records = new Map<string, RecordData>();
let queue = Promise.resolve();
let mirror: unknown = null;
let provider: 'ok' | 'failed' | 'partial' | 'throw' = 'ok';
let readFails = false;
let sends = 0;
let cleanupFails = false;

function snapshot(id: string) {
  const data = records.get(id);
  return { exists: Boolean(data), id: id.split('/').at(-1), data: () => data, get: (key: string) => data?.[key] };
}

function doc(id: string) {
  return {
    id,
    get: async () => {
      if (id === 'publicProfiles/alice' && readFails) { readFails = false; throw new Error('Falha de leitura antes do envio'); }
      return snapshot(id);
    },
    create: async (value: RecordData) => { if (records.has(id)) throw { code: 6 }; records.set(id, value); },
    update: async (value: RecordData) => { records.set(id, { ...records.get(id), ...value }); },
  };
}

const firestore = {
  collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }),
  runTransaction: async <T>(action: (tx: {
    get: (ref: Document) => Promise<ReturnType<typeof snapshot>>;
    set: (ref: Document, value: RecordData) => void;
    update: (ref: Document, value: RecordData) => void;
  }) => Promise<T>): Promise<T> => {
    const previous = queue;
    let release: () => void = () => undefined;
    queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await action({
      get: async (ref) => snapshot(ref.id),
      set: (ref, value) => { records.set(ref.id, value); },
      update: (ref, value) => { records.set(ref.id, { ...records.get(ref.id), ...value }); },
    }); } finally { release(); }
  },
};
const message = { conversationId: 'g1', conversationType: 'group', senderId: 'alice', text: 'oi', target: { type: 'conversation' }, createdAt: 1 };
const doubles = {
  '/firebaseAdmin': {
    adminFirestore: () => firestore,
    adminDatabase: () => ({ ref: (path: string) => ({
      get: async () => ({ exists: () => true, val: () => path === 'conversationMembers/g1' ? mirror : message }),
      transaction: async (update: (current: unknown) => unknown) => {
        assert.equal(path, 'conversationMembers/g1');
        const next = update(mirror); if (next !== undefined) mirror = next;
      },
    }) }),
  },
  '/authenticate': { authenticate: (_req: unknown, _res: unknown, next: () => void) => next(), getAuthenticatedUid: () => 'alice' },
  '/notificationSender': {
    loadDeviceTargets: async () => [{ uid: 'bob', tokenType: 'fcm', token: 'synthetic', docId: 'synthetic' }],
    disableInvalidTokens: async () => { if (cleanupFails) throw new Error('Falha ao desativar token'); },
    sendPush: async (devices: readonly unknown[]) => {
      if (devices.length === 0) return { delivered: 0, failed: 0, invalid: [] };
      sends++;
      if (provider === 'throw') throw new Error('Resultado de envio desconhecido');
      return { delivered: provider === 'failed' ? 0 : 1, failed: provider === 'ok' ? 0 : 1, invalid: [] };
    },
  },
};
const { notificationsRouter } = loadWithMocks<typeof import('./notifications')>(join(__dirname, 'notifications.ts'), doubles);
const { claimDelivery, completeDelivery } = loadWithMocks<typeof import('../services/deliveryGuard')>(join(__dirname, '../services/deliveryGuard.ts'), doubles);

beforeEach(() => {
  records.clear(); mirror = null; provider = 'ok'; readFails = false; sends = 0; cleanupFails = false;
  records.set('groups/g1', { name: 'Grupo', ownerId: 'alice', memberIds: ['alice', 'carol'], memberLimit: 3, notificationPolicy: 'all_group_messages', updatedAt: 2 });
  records.set('publicProfiles/alice', { name: 'Alice' });
});

async function withEndpoint(action: (post: (messageId?: string) => Promise<{ status: number; body: RecordData }>) => Promise<void>) {
  const app = express(); app.use(express.json()); app.use(notificationsRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : 'Erro' });
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try { await action(async (messageId = 'm1') => {
    const response = await fetch(`http://127.0.0.1:${address.port}/notifications/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: 'g1', messageId }),
    });
    const body: unknown = await response.json();
    assert.ok(typeof body === 'object' && body !== null);
    return { status: response.status, body: body as RecordData };
  }); } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

describe('push: recuperação e duplicidade', () => {
  it('falha antes do envio permite repetir a mesma mensagem', async () => {
    await withEndpoint(async (post) => {
      readFails = true;
      assert.equal((await post()).status, 500);
      assert.equal((await post()).body.status, 'sent');
      assert.equal(sends, 1);
    });
  });

  it('processing abandonado pode ser reivindicado após 60 segundos', async () => {
    records.set('notificationDeliveries/g1__m1', { status: 'processing', createdAt: Date.now() - 61000, leaseExpiresAt: Date.now() - 1000 });
    assert.ok(await claimDelivery('g1', 'm1', 'alice'));
  });

  it('processing legado sem lease não é reenviado porque pode já ter sido entregue', async () => {
    records.set('notificationDeliveries/g1__m1', { status: 'processing', createdAt: Date.now() - 61000 });
    assert.equal(await claimDelivery('g1', 'm1', 'alice'), null);
  });

  it('falha total não retorna sent e permite nova tentativa', async () => {
    await withEndpoint(async (post) => {
      provider = 'failed';
      const failed = await post(); assert.equal(failed.status, 502); assert.notEqual(failed.body.status, 'sent');
      provider = 'ok'; assert.equal((await post()).body.status, 'sent'); assert.equal(sends, 2);
    });
  });

  it('entrega parcial não é reenviada', async () => {
    await withEndpoint(async (post) => {
      provider = 'partial'; assert.equal((await post()).body.status, 'sent');
      assert.equal((await post()).body.status, 'duplicate'); assert.equal(sends, 1);
    });
  });

  it('falha na limpeza de tokens não bloqueia retry de uma falha total confirmada', async () => {
    await withEndpoint(async (post) => {
      provider = 'failed'; cleanupFails = true;
      assert.equal((await post()).status, 500);
      provider = 'ok'; cleanupFails = false;
      assert.equal((await post()).body.status, 'sent'); assert.equal(sends, 2);
    });
  });

  it('duas chamadas simultâneas produzem apenas um envio', async () => {
    await withEndpoint(async (post) => {
      const results = await Promise.all([post(), post()]);
      assert.deepEqual(results.map((item) => item.body.status).sort(), ['duplicate', 'sent']); assert.equal(sends, 1);
    });
  });

  it('push de grupo repara o espelho antes do envio', async () => {
    await withEndpoint(async (post) => {
      mirror = { _version: 1, alice: true, bob: true };
      await post(); assert.deepEqual(mirror, { _version: 2, alice: true, carol: true });
    });
  });

  it('lease antiga não finaliza uma reivindicação nova', async () => {
    const first = await claimDelivery('g1', 'm1', 'alice'); assert.ok(first);
    const record = records.get('notificationDeliveries/g1__m1'); assert.ok(record);
    record.leaseExpiresAt = Date.now() - 1;
    const second = await claimDelivery('g1', 'm1', 'alice'); assert.ok(second);
    assert.notEqual(first, second);
    await completeDelivery('g1', 'm1', { recipients: 1, delivered: 1, failed: 0 }, first);
    assert.equal(records.get('notificationDeliveries/g1__m1')?.status, 'processing');
  });

  it('resultado incerto do provedor não é reenviado', async () => {
    await withEndpoint(async (post) => {
      provider = 'throw'; assert.equal((await post()).status, 500);
      assert.equal((await post()).body.status, 'duplicate'); assert.equal(sends, 1);
    });
  });
});
