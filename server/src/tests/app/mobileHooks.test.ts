import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it, mock } from 'node:test';

import { HookHarness, flushPromises, jsxRuntime } from '../hooks';
import { loadWithMocks } from '../modules';

const mobile = (file: string) => join(__dirname, '../../../../src', file);

describe('chat: ciclo de vida da assinatura', () => {
  it('perder participação encerra o listener e impede envio', async () => {
    const harness = new HookHarness();
    let active = 0; let writes = 0;
    const { useChat } = loadWithMocks<{
      useChat: (params: { conversationId: string; conversationType: 'group'; currentUid: string; enabled: boolean }) => {
        send: (options: { text: string; target: { type: 'conversation' }; mentionedUserIds: string[] }) => Promise<boolean>;
        messages: unknown[];
      };
    }>(mobile('hooks/useChat.ts'), {
      react: harness.react,
      '/chatService': { subscribeMessages: () => { active++; return () => { active--; }; }, sendMessage: async () => { writes++; return 'm1'; }, requestMessagePush: async () => undefined },
      '/groupService': { syncGroupMembers: async () => undefined },
    });
    const params = { conversationId: 'g1', conversationType: 'group' as const, currentUid: 'bob', enabled: true };
    harness.render(() => useChat(params)); assert.equal(active, 1);
    const removed = harness.render(() => useChat({ ...params, enabled: false }));
    assert.equal(active, 0);
    assert.equal(await removed.send({ text: 'oi', target: { type: 'conversation' }, mentionedUserIds: [] }), false);
    assert.equal(writes, 0); assert.deepEqual(removed.messages, []);
  });

  it('grupo sem participação confirmada não abre listener', () => {
    const harness = new HookHarness(); let active = 0;
    const { useChat } = loadWithMocks<{ useChat: (params: Record<string, unknown>) => unknown }>(mobile('hooks/useChat.ts'), {
      react: harness.react,
      '/chatService': { subscribeMessages: () => { active++; return () => { active--; }; } },
      '/groupService': { syncGroupMembers: async () => undefined },
    });
    harness.render(() => useChat({ conversationId: 'g1', conversationType: 'group', currentUid: 'bob', enabled: false }));
    assert.equal(active, 0);
  });
});

describe('logout e registro de dispositivo', () => {
  it('falha ao excluir device é avisada e não impede signOut', async () => {
    const harness = new HookHarness(); let signedOut = false;
    const warn = mock.method(console, 'warn', () => undefined);
    try {
      const { useSignOut } = loadWithMocks<{ useSignOut: () => () => Promise<void> }>(mobile('hooks/useNotifications.ts'), {
        react: harness.react,
        '/NotificationContext': { NotificationContext: { value: { unregisterCurrentDevice: async () => { throw new Error('offline'); } } } },
        '/useAuth': { useAuth: () => ({ signOut: async () => { signedOut = true; } }) },
      });
      await harness.render(() => useSignOut())();
      assert.equal(signedOut, true); assert.ok(warn.mock.callCount() > 0);
    } finally { warn.mock.restore(); }
  });

  it('timeout na remoção do device permite logout offline', async () => {
    const harness = new HookHarness(); let signedOut = false;
    const warn = mock.method(console, 'warn', () => undefined);
    const { useSignOut } = loadWithMocks<{ useSignOut: () => () => Promise<void> }>(mobile('hooks/useNotifications.ts'), {
      react: harness.react,
      '/NotificationContext': { NotificationContext: { value: { unregisterCurrentDevice: () => new Promise<void>(() => undefined) } } },
      '/useAuth': { useAuth: () => ({ signOut: async () => { signedOut = true; } }) },
    });
    const timers: (() => void)[] = [];
    const timeout = mock.method(globalThis, 'setTimeout', (callback: () => void) => {
      timers.push(callback); return { unref: () => undefined } as unknown as NodeJS.Timeout;
    });
    const clear = mock.method(globalThis, 'clearTimeout', () => undefined);
    try {
      const pending = harness.render(() => useSignOut())();
      // Evita que a regressão antiga, que espera indefinidamente, deixe o runner pendurado.
      assert.ok(timers.length > 0, 'logout deve ter uma espera limitada');
      timers.forEach((callback) => callback()); await pending;
      assert.equal(signedOut, true); assert.ok(warn.mock.callCount() > 0);
    } finally { timeout.mock.restore(); clear.mock.restore(); warn.mock.restore(); }
  });

  it('registro atrasado de A não substitui o token registrado por B', async () => {
    const harness = new HookHarness();
    let uid = 'alice'; let resolveAlice: (token: { token: string; tokenType: 'fcm' }) => void = () => undefined;
    const pendingAlice = new Promise<{ token: string; tokenType: 'fcm' }>((resolve) => { resolveAlice = resolve; });
    const removed: string[] = [];
    const { NotificationProvider } = loadWithMocks<{ NotificationProvider: (props: { children: null }) => { props: { value: { unregisterCurrentDevice: () => Promise<void> } } } }>(mobile('contexts/NotificationContext.tsx'), {
      react: harness.react, 'react/jsx-runtime': jsxRuntime,
      'expo-router': { useRouter: () => ({ push: () => undefined }) },
      'expo-notifications': { addPushTokenListener: () => ({ remove: () => undefined }), useLastNotificationResponse: () => null },
      '/useAuth': { useAuth: () => ({ status: 'signedIn', profile: { uid }, firebaseUser: { uid } }) },
      '/notificationService': {
        configureForegroundNotifications: () => undefined,
        registerDeviceForPush: (id: string) => id === 'alice' ? pendingAlice : Promise.resolve({ token: 'token-bob', tokenType: 'fcm' }),
        unregisterDevice: async (id: string, token: string) => { removed.push(`${id}/${token}`); },
      },
    });
    harness.render(() => NotificationProvider({ children: null }));
    uid = 'bob'; harness.render(() => NotificationProvider({ children: null })); await flushPromises();
    resolveAlice({ token: 'token-alice', tokenType: 'fcm' }); await flushPromises();
    const current = harness.render(() => NotificationProvider({ children: null }));
    await current.props.value.unregisterCurrentDevice();
    assert.ok(removed.includes('bob/token-bob')); assert.equal(removed.includes('bob/token-alice'), false);
  });

  it('erro de remoção de token não é engolido pelo provider', async () => {
    const harness = new HookHarness();
    const { NotificationProvider } = loadWithMocks<{ NotificationProvider: (props: { children: null }) => { props: { value: { unregisterCurrentDevice: () => Promise<void> } } } }>(mobile('contexts/NotificationContext.tsx'), {
      react: harness.react, 'react/jsx-runtime': jsxRuntime,
      'expo-router': { useRouter: () => ({ push: () => undefined }) },
      'expo-notifications': { addPushTokenListener: () => ({ remove: () => undefined }), useLastNotificationResponse: () => null },
      '/useAuth': { useAuth: () => ({ status: 'signedIn', profile: { uid: 'alice' }, firebaseUser: { uid: 'alice' } }) },
      '/notificationService': { configureForegroundNotifications: () => undefined, registerDeviceForPush: async () => ({ token: 'synthetic', tokenType: 'fcm' }), unregisterDevice: async () => { throw new Error('offline'); } },
    });
    harness.render(() => NotificationProvider({ children: null })); await flushPromises();
    const current = harness.render(() => NotificationProvider({ children: null }));
    await assert.rejects(current.props.value.unregisterCurrentDevice(), /offline/);
  });

  it('sessão sem perfil usa o logout que remove dispositivo', async () => {
    const harness = new HookHarness(); let removed = false; let signedOut = false;
    type Element = { type: unknown; props: { children?: Element[]; onPress?: () => Promise<void> } };
    const { default: SessionRoute } = loadWithMocks<{ default: () => Element }>(mobile('app/session.tsx'), {
      react: harness.react, 'react/jsx-runtime': jsxRuntime,
      'react-native': { View: 'View', StyleSheet: { create: (styles: unknown) => styles } },
      '/Button': { Button: 'Button' }, '/ErrorMessage': { ErrorMessage: 'ErrorMessage' }, '/Loading': { Loading: 'Loading' },
      '/useAuth': { useAuth: () => ({ status: 'missingProfile', signOut: async () => { signedOut = true; } }) },
      '/useNotifications': { useSignOut: () => async () => { removed = true; signedOut = true; } },
    });
    const screen = harness.render(() => SessionRoute());
    const button = screen.props.children?.find((child) => child.type === 'Button'); assert.ok(button?.props.onPress);
    await button.props.onPress(); assert.equal(removed, true); assert.equal(signedOut, true);
  });

  it('erro de perfil não perde o token necessário ao logout', async () => {
    const harness = new HookHarness(); let status = 'signedIn'; let removed = false;
    const { NotificationProvider } = loadWithMocks<{ NotificationProvider: (props: { children: null }) => { props: { value: { unregisterCurrentDevice: () => Promise<void> } } } }>(mobile('contexts/NotificationContext.tsx'), {
      react: harness.react, 'react/jsx-runtime': jsxRuntime,
      'expo-router': { useRouter: () => ({ push: () => undefined }) },
      'expo-notifications': { addPushTokenListener: () => ({ remove: () => undefined }), useLastNotificationResponse: () => null },
      '/useAuth': { useAuth: () => ({ status, profile: status === 'signedIn' ? { uid: 'alice' } : null, firebaseUser: { uid: 'alice' } }) },
      '/notificationService': { configureForegroundNotifications: () => undefined, registerDeviceForPush: async () => ({ token: 'synthetic', tokenType: 'fcm' }), unregisterDevice: async () => { removed = true; } },
    });
    harness.render(() => NotificationProvider({ children: null })); await flushPromises();
    status = 'profileError';
    const current = harness.render(() => NotificationProvider({ children: null }));
    await current.props.value.unregisterCurrentDevice(); assert.equal(removed, true);
  });

  it('limpeza atrasada de A não apaga a referência do dispositivo de B', async () => {
    const harness = new HookHarness(); let uid = 'alice';
    let finishAlice: () => void = () => undefined;
    const pendingAlice = new Promise<void>((resolve) => { finishAlice = resolve; });
    const removed: string[] = [];
    const { NotificationProvider } = loadWithMocks<{ NotificationProvider: (props: { children: null }) => { props: { value: { unregisterCurrentDevice: () => Promise<void> } } } }>(mobile('contexts/NotificationContext.tsx'), {
      react: harness.react, 'react/jsx-runtime': jsxRuntime,
      'expo-router': { useRouter: () => ({ push: () => undefined }) },
      'expo-notifications': { addPushTokenListener: () => ({ remove: () => undefined }), useLastNotificationResponse: () => null },
      '/useAuth': { useAuth: () => ({ status: 'signedIn', profile: { uid }, firebaseUser: { uid } }) },
      '/notificationService': {
        configureForegroundNotifications: () => undefined,
        registerDeviceForPush: async (id: string) => ({ token: `token-${id}`, tokenType: 'fcm' }),
        unregisterDevice: async (id: string, token: string) => { removed.push(`${id}/${token}`); if (id === 'alice') await pendingAlice; },
      },
    });
    harness.render(() => NotificationProvider({ children: null })); await flushPromises();
    const alice = harness.render(() => NotificationProvider({ children: null }));
    const cleanup = alice.props.value.unregisterCurrentDevice();
    uid = 'bob'; harness.render(() => NotificationProvider({ children: null })); await flushPromises();
    finishAlice(); await cleanup;
    const bob = harness.render(() => NotificationProvider({ children: null }));
    await bob.props.value.unregisterCurrentDevice(); assert.ok(removed.includes('bob/token-bob'));
  });
});
