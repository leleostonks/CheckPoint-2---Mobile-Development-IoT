import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it, mock } from 'node:test';

import { HookHarness, flushPromises } from '../hooks';
import { loadWithMocks } from '../modules';

describe('chat: mensagem salva e resultado do push', () => {
  for (const [name, httpStatus, body, failed] of [
    ['status failed', 200, { status: 'failed', recipients: 1, delivered: 0, failed: 1 }, true],
    ['HTTP de erro', 502, { error: 'Nenhuma notificação pôde ser enviada. Tente novamente.' }, true],
    ['sent', 200, { status: 'sent', recipients: 1, delivered: 1 }, false],
    ['duplicate', 200, { status: 'duplicate', recipients: 0, delivered: 0 }, false],
    ['skipped', 200, { status: 'skipped', recipients: 0, delivered: 0 }, false],
  ] as const) {
    it(`${name}: preserva mensagem e informa corretamente o resultado`, async () => {
      const harness = new HookHarness(); const saved: unknown[] = [];
      const client = loadWithMocks<Record<string, unknown>>(join(__dirname, '../../../../src/services/apiClient.ts'), {
        '/firebase': { auth: { currentUser: { getIdToken: async () => 'synthetic' } } },
      });
      const chat = loadWithMocks<Record<string, unknown>>(join(__dirname, '../../../../src/services/chatService.ts'), {
        '/apiClient': client, '/firebase': { firestore: {}, realtimeDb: {} },
        'firebase/database': {
          ref: () => ({}), push: () => ({ key: 'saved-message' }), set: async (_ref: unknown, value: unknown) => { saved.push(value); },
          serverTimestamp: () => 1, query: () => ({}), orderByKey: () => ({}), limitToLast: () => ({}), onValue: () => () => undefined,
        },
      });
      const { useChat } = loadWithMocks<{ useChat: (params: { conversationId: string; conversationType: 'direct'; currentUid: string }) => { send: (options: { text: string; target: { type: 'conversation' }; mentionedUserIds: string[] }) => Promise<boolean>; pushWarning: string | null; sendError: string | null } }>(join(__dirname, '../../../../src/hooks/useChat.ts'), {
        react: harness.react, '/chatService': chat, '/groupService': {},
      });
      const fetchMock = mock.method(globalThis, 'fetch', async (_input: unknown, options?: RequestInit) => {
        assert.deepEqual(JSON.parse(String(options?.body)), { conversationId: 'direct_alice_bob', messageId: 'saved-message' });
        return Response.json(body, { status: httpStatus });
      });
      try {
        const params = { conversationId: 'direct_alice_bob', conversationType: 'direct' as const, currentUid: 'alice' };
        const hook = harness.render(() => useChat(params));
        assert.equal(await hook.send({ text: 'oi', target: { type: 'conversation' }, mentionedUserIds: [] }), true);
        await flushPromises();
        const result = harness.render(() => useChat(params));
        assert.equal(saved.length, 1); assert.equal(result.sendError, null);
        if (failed) {
          assert.ok(result.pushWarning);
          assert.match(result.pushWarning, /mensagem.*(salva|enviada)/i);
          assert.match(result.pushWarning, /notifica/i);
        } else assert.equal(result.pushWarning, null);
      } finally { fetchMock.mock.restore(); }
    });
  }
});
