import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';
import 'firebase/compat/firestore';

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
  env = await initializeTestEnvironment({
    projectId: 'demo-chat',
    firestore: { rules: readFileSync(`${PROJECT}/firestore.rules`, 'utf8'), host: '127.0.0.1', port: 8080 },
    database: { rules: readFileSync(`${PROJECT}/database.rules.json`, 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});

after(async () => {
  await env.cleanup();
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
    await ctx.database().ref('conversationMembers/g1').set({ alice: true, bob: true });
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
});
