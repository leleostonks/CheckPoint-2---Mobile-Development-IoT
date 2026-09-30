import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { GroupMemberItem } from '../components/GroupMemberItem';
import { Loading } from '../components/Loading';
import { useCurrentUser } from '../hooks/useAuth';
import { useUsers } from '../hooks/usePublicProfiles';
import { getOrCreateDirectConversation } from '../services/chatService';
import type { PublicProfile } from '../types/user';
import { getErrorMessage } from '../utils/errorMessages';
import { setPendingMemberSelection } from '../utils/memberSelection';
import { normalizeSearch } from '../utils/formatters';
import { colors, radius, spacing } from '../utils/theme';

export type UsersScreenProps =
  | { mode: 'direct' }
  | {
      mode: 'select';
      /** Integrantes já selecionados (sem o usuário atual). */
      initialSelection: readonly string[];
      /** Quantos integrantes ainda podem ser escolhidos, considerando o limite do grupo. */
      maxSelectable: number;
    };

export function UsersScreen(props: UsersScreenProps) {
  const user = useCurrentUser();
  const router = useRouter();
  const { users, loading, error } = useUsers();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<readonly string[]>(props.mode === 'select' ? props.initialSelection : []);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // O próprio usuário nunca aparece: não é possível conversar consigo mesmo.
  const filteredUsers = useMemo(() => {
    const term = normalizeSearch(search);
    return users.filter(
      (profile: PublicProfile) =>
        profile.uid !== user.uid && (term === '' || normalizeSearch(profile.name).includes(term)),
    );
  }, [users, search, user.uid]);

  const limitReached = props.mode === 'select' && selected.length >= props.maxSelectable;

  const handlePress = useCallback(
    async (uid: string) => {
      setActionError(null);
      if (props.mode === 'select') {
        setSelected((current) => {
          if (current.includes(uid)) {
            return current.filter((id) => id !== uid);
          }
          return current.length >= props.maxSelectable ? current : [...current, uid];
        });
        return;
      }
      setOpeningId(uid);
      try {
        const conversationId = await getOrCreateDirectConversation(user.uid, uid);
        router.replace({ pathname: '/chat/[conversationId]', params: { conversationId, type: 'direct' } });
      } catch (openError) {
        setActionError(getErrorMessage(openError, 'Não foi possível abrir a conversa.'));
        setOpeningId(null);
      }
    },
    [props, router, user.uid],
  );

  const confirmSelection = useCallback(() => {
    setPendingMemberSelection(selected);
    router.back();
  }, [router, selected]);

  const title = props.mode === 'select' ? `Integrantes (${selected.length}/${props.maxSelectable})` : 'Nova conversa';

  if (loading) {
    return <Loading message="Carregando usuários..." />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title }} />
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar pelo nome"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          accessibilityLabel="Buscar usuários"
        />
      </View>

      <View style={styles.banners}>
        {error ? <ErrorMessage message={error} /> : null}
        {actionError ? <ErrorMessage message={actionError} onDismiss={() => setActionError(null)} /> : null}
        {limitReached ? <ErrorMessage tone="warning" message="Limite de integrantes atingido para este grupo." /> : null}
      </View>

      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.uid}
        renderItem={({ item }) => {
          const isSelected = selected.includes(item.uid);
          return (
            <GroupMemberItem
              uid={item.uid}
              profile={item}
              selected={props.mode === 'select' ? isSelected : undefined}
              disabled={openingId !== null || (limitReached && !isSelected)}
              subtitle={openingId === item.uid ? 'Abrindo conversa...' : undefined}
              onPress={handlePress}
            />
          );
        }}
        contentContainerStyle={filteredUsers.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={search ? 'Nenhum usuário encontrado' : 'Nenhum outro usuário cadastrado'}
            description={search ? 'Tente outro nome.' : 'Peça para outra pessoa criar uma conta.'}
          />
        }
      />

      {props.mode === 'select' ? (
        <View style={styles.footer}>
          <Button title="Confirmar seleção" onPress={confirmSelection} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    color: colors.text,
  },
  banners: {
    paddingHorizontal: spacing.md,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  footer: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
