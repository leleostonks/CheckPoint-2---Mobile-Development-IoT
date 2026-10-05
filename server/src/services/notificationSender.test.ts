import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it, mock } from 'node:test';

import { loadWithMocks } from '../tests/modules';

const { sendPush } = loadWithMocks<typeof import('./notificationSender')>(join(__dirname, 'notificationSender.ts'), {
  '/firebaseAdmin': { adminMessaging: () => { throw new Error('Teste usa somente transporte Expo sintético.'); } },
});
const devices = [{ uid: 'bob', docId: 'synthetic', token: 'synthetic', tokenType: 'expo' as const }];
const content = { title: 'Grupo', body: 'Mensagem', data: { conversationId: 'g1', conversationType: 'group' } };

describe('Expo: resultado confirmado ou incerto', () => {
  for (const [name, response] of [
    ['JSON truncado', () => new Response('{', { status: 200 })],
    ['formato inválido', () => Response.json({ unexpected: true })],
    ['quantidade de tickets diferente', () => Response.json({ data: [] })],
    ['erro HTTP sem confirmação individual', () => new Response('', { status: 503 })],
  ] as const) {
    it(`${name} não é classificado como falha total confirmada`, async () => {
      const fetchMock = mock.method(globalThis, 'fetch', async () => response());
      try { await assert.rejects(sendPush(devices, content), /incerto/i); }
      finally { fetchMock.mock.restore(); }
    });
  }

  it('ticket explícito de falha continua permitindo contabilizar falha total', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }));
    try {
      const result = await sendPush(devices, content);
      assert.equal(result.delivered, 0); assert.equal(result.failed, 1); assert.deepEqual(result.invalid, devices);
    } finally { fetchMock.mock.restore(); }
  });
});
