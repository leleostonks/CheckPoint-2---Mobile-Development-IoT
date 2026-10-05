import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { HookHarness, flushPromises, jsxRuntime } from '../hooks';
import { loadWithMocks } from '../modules';
import type { UpdateGroupInput } from '../../../../src/types/group';

type Element = { type: unknown; props: { children?: unknown[]; title?: string; label?: string; uid?: string; onPress?: () => Promise<void>; onChangeText?: (text: string) => void; onRemove?: (uid: string) => void } };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== 'object' || node === null || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...(element.props.children ?? []).flatMap(elements)];
}

async function form() {
  const harness = new HookHarness();
  let stored = { id: 'g1', name: 'Grupo', photoUrl: '', ownerId: 'alice', memberIds: ['alice', 'bob', 'dave'], memberLimit: 5, notificationPolicy: 'all_group_messages', updatedBy: 'alice', createdAt: 1, updatedAt: 1 };
  const reference = { withConverter: () => reference };
  const service = loadWithMocks<{ updateGroup: (groupId: string, uid: string, input: UpdateGroupInput, photo: null) => Promise<void> }>(join(__dirname, '../../../../src/services/groupService.ts'), {
    'firebase/firestore': {
      collection: () => reference, doc: () => reference,
      runTransaction: async (_db: unknown, action: (transaction: { get: () => Promise<{ exists: () => boolean; data: () => typeof stored }>; update: (_ref: unknown, changes: Partial<typeof stored>) => void }) => Promise<void>) => action({
        get: async () => ({ exists: () => true, data: () => stored }), update: (_ref, changes) => { stored = { ...stored, ...changes }; },
      }),
    },
    '/firebase': { firestore: {} }, '/imageService': {}, '/apiClient': { parseOk: () => true, apiRequest: async () => true },
  });
  const { GroupFormScreen } = loadWithMocks<{ GroupFormScreen: (props: { groupId: string }) => Element }>(join(__dirname, '../../../../src/screens/GroupFormScreen.tsx'), {
    react: harness.react, 'react/jsx-runtime': jsxRuntime,
    'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: (styles: unknown) => styles } },
    'expo-router': { Stack: { Screen: 'Screen' }, useRouter: () => ({ back: () => undefined }), useFocusEffect: () => undefined },
    '/useAuth': { useCurrentUser: () => ({ uid: 'alice' }) }, '/useGroups': { useGroup: () => ({ group: stored, loading: false, error: null }) },
    '/usePublicProfiles': { usePublicProfiles: () => ({}) }, '/groupService': service,
    ...Object.fromEntries(['Button', 'ErrorMessage', 'FormScreen', 'GroupMemberItem', 'Loading', 'PhotoPicker', 'PolicySelector', 'TextField'].map((name) => [`/${name}`, { [name]: name }])),
  });
  const render = () => elements(harness.render(() => GroupFormScreen({ groupId: 'g1' })));
  render(); await flushPromises();
  return { render, getGroup: () => stored, replaceGroup: (changes: Partial<typeof stored>) => { stored = { ...stored, ...changes }; } };
}

describe('formulário: intenção de edição concorrente', () => {
  it('salvar só nome preserva membro adicionado em outra sessão', async () => {
    const screen = await form();
    screen.replaceGroup({ memberIds: ['alice', 'bob', 'dave', 'carol'], updatedAt: 2 });
    const name = screen.render().find((element) => element.props.label === 'Nome do grupo'); assert.ok(name?.props.onChangeText);
    name.props.onChangeText('Nome alterado');
    const save = screen.render().find((element) => element.props.title === 'Salvar alterações'); assert.ok(save?.props.onPress);
    await save.props.onPress();
    assert.equal(screen.getGroup().name, 'Nome alterado');
    assert.deepEqual(screen.getGroup().memberIds, ['alice', 'bob', 'dave', 'carol']);
  });

  it('remoção escolhida no formulário preserva adição e remoção concorrentes', async () => {
    const screen = await form();
    const bob = screen.render().find((element) => element.type === 'GroupMemberItem' && element.props.uid === 'bob'); assert.ok(bob?.props.onRemove);
    bob.props.onRemove('bob');
    // Outra sessão acrescenta Carol e remove Dave depois de o formulário ter sido aberto.
    screen.replaceGroup({ memberIds: ['alice', 'bob', 'carol'], updatedAt: 2 });
    const save = screen.render().find((element) => element.props.title === 'Salvar alterações'); assert.ok(save?.props.onPress);
    await save.props.onPress();
    assert.deepEqual(screen.getGroup().memberIds, ['alice', 'carol']);
  });
});
