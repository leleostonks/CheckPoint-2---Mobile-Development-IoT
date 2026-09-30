import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationItem } from '../components/ConversationItem';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { ConnectionBanner, NotificationBanner } from '../components/StatusBanners';
import { useCurrentUser } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { useSignOut } from '../hooks/useNotifications';
import type { ConversationSummary } from '../types/chat';
import { getErrorMessage } from '../utils/errorMessages';
import { colors, radius, spacing } from '../utils/theme';

export function ConversationsScreen() {
  const user = useCurrentUser();
  const router = useRouter();
  const signOut = useSignOut();
  const { conversations, loading, error } = useConversations(user.uid);
  const [signingOut, setSigningOut] = useState(false);

  const openConversation = useCallback(
    (item: ConversationSummary) => {
      router.push({
        pathname: '/chat/[conversationId]',
        params: { conversationId: item.id, type: item.kind },
      });
    },
    [router],
  );

  const confirmSignOut = useCallback(() => {
    Alert.alert('Sair', 'Deseja encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          signOut().catch((signOutError: unknown) => {
            setSigningOut(false);
            Alert.alert('Erro', getErrorMessage(signOutError, 'Não foi possível sair.'));
          });
        },
      },
    ]);
  }, [signOut]);

  const renderItem = useCallback(
    ({ item }: { item: ConversationSummary }) => (
      <ConversationItem item={item} currentUid={user.uid} onPress={openConversation} />
    ),
    [openConversation, user.uid],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Conversas',
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => router.push({ pathname: '/profile/[uid]', params: { uid: user.uid } })}
                hitSlop={8}
                accessibilityLabel="Meu perfil"
              >
                <Ionicons name="person-circle-outline" size={26} color={colors.primary} />
              </Pressable>
              <Pressable onPress={confirmSignOut} hitSlop={8} disabled={signingOut} accessibilityLabel="Sair">
                <Ionicons name="log-out-outline" size={26} color={colors.danger} />
              </Pressable>
            </View>
          ),
        }}
      />

      <View style={styles.banners}>
        <ConnectionBanner />
        <NotificationBanner />
        {error ? <ErrorMessage message={error} /> : null}
      </View>

      {loading || signingOut ? (
        <Loading message={signingOut ? 'Saindo...' : 'Carregando conversas...'} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="Nenhuma conversa ainda"
              description="Inicie uma conversa individual ou crie um grupo."
            />
          }
        />
      )}

      <View style={styles.footer}>
        <Pressable
          style={styles.action}
          onPress={() => router.push({ pathname: '/users', params: { mode: 'direct' } })}
          accessibilityRole="button"
        >
          <Ionicons name="person-add" size={20} color="#FFFFFF" />
          <Text style={styles.actionText}>Nova conversa</Text>
        </Pressable>
        <Pressable
          style={[styles.action, styles.actionSecondary]}
          onPress={() => router.push('/group-form')}
          accessibilityRole="button"
        >
          <Ionicons name="people" size={20} color={colors.primary} />
          <Text style={[styles.actionText, styles.actionTextSecondary]}>Novo grupo</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  banners: {
    paddingHorizontal: spacing.md,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 80,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  actionSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  actionTextSecondary: {
    color: colors.primary,
  },
});
