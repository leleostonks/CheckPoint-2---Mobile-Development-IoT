import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it, mock } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';
import 'firebase/compat/firestore';

import { adminDatabase } from '../../server/src/services/firebaseAdmin';
import { callGroupSync, initializeDemoAdmin } from '../../server/src/tests/groupRoute';

const PROJECT = join(__dirname, '..');
let env: RulesTestEnvironment;

const now = Date.now();
const group = (overrides: Record<string, unknown> = {}) => ({
  name: 'Grupo',
  photoUrl: '',
  ownerId: 'alice',
  memberIds: ['alice', 'bob'],
  memberLimit: 3,
  notificationPolicy: 'all_group_messages',
  updatedBy: 'alice',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});
const message = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'g1',
  conversationType: 'group',
  senderId: 'alice',
  text: 'oi',
  target: { type: 'conversation' },
  createdAt: firebase.database.ServerValue.TIMESTAMP,
  ...overrides,
});

const fs = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@teste.com` }).firestore();
const db = (uid: string) => env.authenticatedContext(uid).database();

before(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
  initializeDemoAdmin();
  env = await initializeTestEnvironment({
    projectId: 'demo-chat',
    firestore: { rules: readFileSync(`${PROJECT}/firestore.rules`, 'utf8'), host: '127.0.0.1', port: 8080 },
    database: { rules: readFileSync(`${PROJECT}/database.rules.json`, 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});

after(async () => {
  await env.cleanup();
  const requireServer = createRequire(join(__dirname, '../../server/package.json'));
  const appSdk = requireServer('firebase-admin/app') as {
    getApps: () => unknown[];
    deleteApp: (app: unknown) => Promise<void>;
  };
  await Promise.all(appSdk.getApps().map((app) => appSdk.deleteApp(app)));
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    for (const uid of ['alice', 'bob', 'carol', 'dave']) {
      await admin.doc(`publicProfiles/${uid}`).set({ name: uid, nameLower: uid, photoUrl: '' });
    }
    await admin.doc('users/alice').set({
      name: 'Alice', email: 'alice@teste.com', phoneNumber: '(11) 91234-5678',
      birthDate: '2000-01-01', photoUrl: '', createdAt: now,
    });
    await admin.doc('groups/g1').set(group());
    await ctx.database().ref('conversationMembers/g1').set({ _version: now, alice: true, bob: true });
  });
});

describe('Firestore: perfis e tokens', () => {
  it('perfil completo só é legível pelo dono', async () => {
    await assertSucceeds(fs('alice').doc('users/alice').get());
    await assertFails(fs('bob').doc('users/alice').get());
  });

  it('nome/foto públicos para autenticados, e cada um só edita o seu', async () => {
    await assertSucceeds(fs('bob').doc('publicProfiles/alice').get());
    await assertFails(env.unauthenticatedContext().firestore().doc('publicProfiles/alice').get());
    await assertFails(fs('bob').doc('publicProfiles/alice').set({ name: 'x', nameLower: 'x', photoUrl: '' }));
  });

  it('cadastro valida campos e e-mail do token', async () => {
    const valid = { name: 'Bob', email: 'bob@teste.com', phoneNumber: '(11) 90000-0000', birthDate: '1999-12-31', photoUrl: '', createdAt: now };
    await assertSucceeds(fs('bob').doc('users/bob').set(valid));
    await assertFails(fs('carol').doc('users/carol').set({ ...valid, email: 'outro@teste.com' }));
    await assertFails(fs('carol').doc('users/carol').set({ ...valid, email: 'carol@teste.com', photoUrl: 'data:image/png;base64,AAA' }));
  });

  it('tokens de dispositivo não são públicos', async () => {
    const device = { token: 'abc', tokenType: 'fcm', platform: 'android', enabled: true, updatedAt: now };
    await assertSucceeds(fs('alice').doc('users/alice/devices/abc').set(device));
    await assertFails(fs('bob').doc('users/alice/devices/abc').get());
    await assertFails(fs('bob').collection('users/alice/devices').get());
  });
});

describe('Firestore: conversas individuais', () => {
  it('cria conversa com id determinístico e exatamente dois participantes', async () => {
    await assertSucceeds(
      fs('alice').doc('directConversations/direct_alice_bob').set({ participantIds: ['alice', 'bob'], createdAt: now }),
    );
  });

  it('bloqueia conversa consigo mesmo, fora de ordem ou de terceiros', async () => {
    await assertFails(fs('alice').doc('directConversations/direct_alice_alice').set({ participantIds: ['alice', 'alice'], createdAt: now }));
    await assertFails(fs('alice').doc('directConversations/direct_bob_alice').set({ participantIds: ['bob', 'alice'], createdAt: now }));
    await assertFails(fs('alice').doc('directConversations/direct_bob_carol').set({ participantIds: ['bob', 'carol'], createdAt: now }));
  });

  it('participante consulta antes de existir; terceiros não leem', async () => {
    await assertSucceeds(fs('alice').doc('directConversations/direct_alice_carol').get());
    await fs('alice').doc('directConversations/direct_alice_bob').set({ participantIds: ['alice', 'bob'], createdAt: now });
    await assertFails(fs('carol').doc('directConversations/direct_alice_bob').get());
    await assertSucceeds(fs('bob').collection('directConversations').where('participantIds', 'array-contains', 'bob').get());
  });
});

describe('Firestore: grupos e limite de integrantes', () => {
  it('não cria grupo acima do limite ou com menos de dois integrantes', async () => {
    await assertFails(fs('alice').doc('groups/g2').set(group({ memberIds: ['alice', 'bob', 'carol'], memberLimit: 2 })));
    await assertFails(fs('alice').doc('groups/g2').set(group({ memberIds: ['alice'] })));
    await assertFails(fs('alice').doc('groups/g2').set(group({ memberLimit: 2.5 })));
    await assertFails(fs('alice').doc('groups/g2').set(group({ ownerId: 'bob', updatedBy: 'alice' })));
    await assertSucceeds(fs('alice').doc('groups/g2').set(group()));
  });

  it('somente integrantes leem e somente o proprietário altera', async () => {
    await assertSucceeds(fs('bob').doc('groups/g1').get());
    await assertFails(fs('carol').doc('groups/g1').get());
    await assertFails(fs('bob').doc('groups/g1').update({ name: 'Hack', updatedBy: 'bob', updatedAt: now }));
    await assertSucceeds(fs('alice').doc('groups/g1').update({ name: 'Novo', updatedBy: 'alice', updatedAt: now }));
  });

  it('limite não pode ficar menor que a quantidade atual', async () => {
    await assertFails(fs('alice').doc('groups/g1').update({ memberLimit: 1, updatedBy: 'alice', updatedAt: now }));
    await assertSucceeds(fs('alice').doc('groups/g1').update({ memberLimit: 2, updatedBy: 'alice', updatedAt: now }));
  });

  it('entradas simultâneas não ultrapassam o limite (1 vaga, 2 pedidos)', async () => {
    const add = (uid: string) =>
      fs('alice').doc('groups/g1').update({
        memberIds: firebase.firestore.FieldValue.arrayUnion(uid),
        updatedBy: 'alice',
        updatedAt: Date.now(),
      });
    const results = await Promise.allSettled([add('carol'), add('dave')]);
    const ok = results.filter((result) => result.status === 'fulfilled').length;
    assert.equal(ok, 1, 'exatamente uma entrada deve ser aceita');

    let memberIds: string[] = [];
    await env.withSecurityRulesDisabled(async (ctx) => {
      memberIds = (await ctx.firestore().doc('groups/g1').get()).get('memberIds');
    });
    assert.equal(memberIds.length, 3);
  });

  it('coleção de idempotência é inacessível ao app', async () => {
    await assertFails(fs('alice').doc('notificationDeliveries/x').get());
    await assertFails(fs('alice').doc('notificationDeliveries/x').set({ a: 1 }));
  });
});

describe('Realtime Database: mensagens', () => {
  it('integrante envia; não integrante não lê nem envia', async () => {
    await assertSucceeds(db('alice').ref('messages/g1/m1').set(message()));
    await assertSucceeds(db('bob').ref('messages/g1').get());
    await assertFails(db('carol').ref('messages/g1').get());
    await assertFails(db('carol').ref('messages/g1/m2').set(message({ senderId: 'carol' })));
  });

  it('senderId deve ser o usuário autenticado e mensagens não são sobrescritas', async () => {
    await assertFails(db('alice').ref('messages/g1/m1').set(message({ senderId: 'bob' })));
    await assertSucceeds(db('alice').ref('messages/g1/m1').set(message()));
    await assertFails(db('alice').ref('messages/g1/m1').set(message({ text: 'editado' })));
  });

  it('destinatário e menções precisam ser integrantes', async () => {
    await assertFails(db('alice').ref('messages/g1/m1').set(message({ target: { type: 'member', memberId: 'carol' } })));
    await assertSucceeds(
      db('alice').ref('messages/g1/m2').set(message({ target: { type: 'member', memberId: 'bob' }, mentionedUserIds: ['bob'] })),
    );
    await assertFails(db('alice').ref('messages/g1/m3').set(message({ mentionedUserIds: ['carol'] })));
  });

  it('integrante removido perde acesso a novas mensagens', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('conversationMembers/g1/bob').remove();
    });
    await assertFails(db('bob').ref('messages/g1').get());
    await assertFails(db('bob').ref('messages/g1/m9').set(message({ senderId: 'bob' })));
  });

  it('conversa individual: só os dois participantes, nunca consigo mesmo', async () => {
    const direct = (sender: string) =>
      message({ conversationId: 'direct_alice_bob', conversationType: 'direct', senderId: sender });
    await assertSucceeds(db('alice').ref('messages/direct_alice_bob/m1').set(direct('alice')));
    await assertSucceeds(db('bob').ref('messages/direct_alice_bob').get());
    await assertFails(db('carol').ref('messages/direct_alice_bob').get());
    await assertFails(db('carol').ref('messages/direct_alice_bob/m2').set(direct('carol')));
    await assertFails(
      db('alice').ref('messages/direct_alice_alice/m1').set(message({ conversationId: 'direct_alice_alice', conversationType: 'direct' })),
    );
  });

  it('espelho de integrantes é somente leitura para o app', async () => {
    await assertFails(db('alice').ref('conversationMembers/g1/carol').set(true));
  });

  it('recusa conversa direta com três participantes', async () => {
    const conversationId = 'direct_alice_bob_carol';
    await assertFails(db('alice').ref(`messages/${conversationId}/m1`).set(message({ conversationId, conversationType: 'direct' })));
    await assertFails(db('carol').ref(`messages/${conversationId}`).get());
  });

  it('recusa conversa direta incompleta e usuário que não participa', async () => {
    await assertFails(db('alice').ref('messages/direct_alice/m1').set(message({ conversationId: 'direct_alice', conversationType: 'direct' })));
    await assertFails(db('carol').ref('messages/direct_alice_bob').get());
  });

  it('recusa par direto fora de ordem', async () => {
    await assertFails(db('alice').ref('messages/direct_bob_alice/m1').set(message({ conversationId: 'direct_bob_alice', conversationType: 'direct' })));
  });

  it('recusa menções escalares em vez de lista', async () => {
    await assertFails(db('alice').ref('messages/g1/scalar').set(message({ mentionedUserIds: 'bob' })));
    await assertFails(db('alice').ref('messages/g1/boolean').set(message({ mentionedUserIds: true })));
  });

  it('alteração de integrantes exige uma versão mais nova', async () => {
    await assertFails(fs('alice').doc('groups/g1').update({ memberIds: ['alice', 'bob', 'carol'], updatedBy: 'alice', updatedAt: now }));
  });
});

describe('API: sincronização Firestore → Realtime Database', () => {
  it('API nova grava integrantes planos e mantém leitura/envio nas regras atuais', async () => {
    await callGroupSync('g1', 'alice');
    const mirror = await assertSucceeds(db('alice').ref('conversationMembers/g1').get());
    assert.equal(mirror.child('alice').val(), true);
    assert.equal(mirror.child('_version').val(), now);
    await assertSucceeds(db('bob').ref('messages/g1').get());
    await assertSucceeds(db('bob').ref('messages/g1/compat').set(message({ senderId: 'bob' })));
    await fs('alice').doc('groups/g1').update({ memberIds: ['alice', 'carol'], updatedBy: 'alice', updatedAt: now + 1 });
    await callGroupSync('g1', 'alice');
    await assertFails(db('bob').ref('messages/g1').get());
    await assertFails(db('bob').ref('messages/g1/removed-compat').set(message({ senderId: 'bob' })));
  });

  it('espelho legado sem versão funciona nas regras atuais e o próximo sync converte', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('conversationMembers/g1').set({ alice: true, bob: true });
    });
    await assertSucceeds(db('bob').ref('messages/g1').get());
    await assertSucceeds(db('alice').ref('messages/g1/legacy').set(message({ target: { type: 'member', memberId: 'bob' }, mentionedUserIds: ['bob'] })));
    await callGroupSync('g1', 'alice');
    const mirror = await assertSucceeds(db('alice').ref('conversationMembers/g1').get());
    assert.equal(mirror.child('_version').val(), now);
    assert.equal(mirror.child('bob').val(), true);
    await assertSucceeds(db('bob').ref('messages/g1/converted').set(message({ senderId: 'bob' })));
  });

  it('API nova também permite acesso e revogação com as regras antigas', async () => {
    // Fixture das regras originais da entrega; não depende do histórico Git para executar.
    const legacy = await initializeTestEnvironment({
      projectId: 'demo-chat',
      database: { rules: readFileSync(`${PROJECT}/tests/fixtures/database.legacy.rules.json`, 'utf8'), host: '127.0.0.1', port: 9000 },
    });
    try {
      await callGroupSync('g1', 'alice');
      await assertSucceeds(legacy.authenticatedContext('bob').database().ref('messages/g1').get());
      await assertSucceeds(legacy.authenticatedContext('alice').database().ref('messages/g1/old-rules').set(message({ target: { type: 'member', memberId: 'bob' }, mentionedUserIds: ['bob'] })));
      await fs('alice').doc('groups/g1').update({ memberIds: ['alice', 'carol'], updatedBy: 'alice', updatedAt: now + 1 });
      await callGroupSync('g1', 'alice');
      await assertFails(legacy.authenticatedContext('bob').database().ref('messages/g1').get());
      await assertFails(legacy.authenticatedContext('bob').database().ref('messages/g1/old-removed').set(message({ senderId: 'bob' })));
    } finally {
      await legacy.cleanup();
      const restored = await initializeTestEnvironment({ projectId: 'demo-chat', database: { rules: readFileSync(`${PROJECT}/database.rules.json`, 'utf8'), host: '127.0.0.1', port: 9000 } });
      await restored.cleanup();
    }
  });

  it('edição sem troca de integrantes não pode regredir a versão e permitir falsa confirmação', async () => {
    await callGroupSync('g1', 'alice');
    await assertFails(fs('alice').doc('groups/g1').update({ name: 'Outro nome', updatedBy: 'alice', updatedAt: 1 }));
    await fs('alice').doc('groups/g1').update({ memberIds: ['alice', 'carol'], updatedBy: 'alice', updatedAt: now + 1 });
    await callGroupSync('g1', 'alice');
    await assertFails(db('bob').ref('messages/g1').get());
  });

  it('remoção sincronizada revoga leitura/envio e mantém o espelho legível pelo integrante', async () => {
    await callGroupSync('g1', 'alice');
    await fs('alice').doc('groups/g1').update({ memberIds: ['alice', 'carol'], updatedBy: 'alice', updatedAt: now + 1 });
    await callGroupSync('g1', 'alice');
    await assertFails(db('bob').ref('messages/g1').get());
    await assertFails(db('bob').ref('messages/g1/removed').set(message({ senderId: 'bob' })));
    const mirror = await assertSucceeds(db('alice').ref('conversationMembers/g1').get());
    assert.equal(mirror.child('_version').val(), now + 1);
    assert.equal(mirror.child('carol').val(), true);
    await assertFails(db('bob').ref('conversationMembers/g1').get());
  });

  it('sincronização atrasada não restaura um integrante removido', async () => {
    const database = adminDatabase();
    const originalRef = database.ref.bind(database);
    let release: () => void = () => undefined;
    let started: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    let delayFirst = true;
    const patched = mock.method(database, 'ref', (path?: string) => {
      const reference = originalRef(path);
      if (path !== 'conversationMembers/g1') return reference;
      return new Proxy(reference, {
        get(target, key) {
          const value: unknown = Reflect.get(target, key, target);
          if ((key === 'set' || key === 'transaction') && typeof value === 'function') {
            return async (...args: unknown[]) => {
              if (delayFirst) { delayFirst = false; started(); await held; }
              return Reflect.apply(value, target, args);
            };
          }
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    try {
      const staleSync = callGroupSync('g1', 'alice');
      await ready;
      await fs('alice').doc('groups/g1').update({ memberIds: ['alice', 'carol'], updatedBy: 'alice', updatedAt: now + 1 });
      await callGroupSync('g1', 'alice');
      release();
      await staleSync;
      await assertFails(db('bob').ref('messages/g1').get());
      await assertSucceeds(db('carol').ref('messages/g1').get());
    } finally { release(); patched.mock.restore(); }
  });

  it('falha do espelho rejeita confirmação e nova tentativa conclui a revogação', async () => {
    await fs('alice').doc('groups/g1').update({ memberIds: ['alice', 'carol'], updatedBy: 'alice', updatedAt: now + 1 });
    const database = adminDatabase();
    const originalRef = database.ref.bind(database);
    const patched = mock.method(database, 'ref', (path?: string) => {
      const reference = originalRef(path);
      return new Proxy(reference, {
        get(target, key) {
          if (key === 'set' || key === 'transaction') return async () => { throw new Error('Falha sintética do espelho'); };
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    try { await assert.rejects(callGroupSync('g1', 'alice'), /Falha sintética/); }
    finally { patched.mock.restore(); }
    await callGroupSync('g1', 'alice');
    await assertFails(db('bob').ref('messages/g1').get());
  });

  it('uid com nome de metadado não colide com a versão do espelho', async () => {
    await fs('alice').doc('groups/g1').update({ memberIds: ['alice', 'updatedAt'], updatedBy: 'alice', updatedAt: now + 1 });
    await callGroupSync('g1', 'alice');
    const mirror = await assertSucceeds(db('updatedAt').ref('conversationMembers/g1').get());
    assert.equal(mirror.child('_version').val(), now + 1);
    assert.equal(mirror.child('updatedAt').val(), true);
    await assertSucceeds(db('updatedAt').ref('messages/g1/meta').set(message({ senderId: 'updatedAt' })));
  });
});
