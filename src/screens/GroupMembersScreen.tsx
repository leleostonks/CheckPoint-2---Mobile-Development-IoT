import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { GroupMemberItem } from '../components/GroupMemberItem';
import { Loading } from '../components/Loading';
import { useCurrentUser } from '../hooks/useAuth';
import { useGroup } from '../hooks/useGroups';
import { usePublicProfiles } from '../hooks/usePublicProfiles';
import { removeGroupMember } from '../services/groupService';
import { getErrorMessage } from '../utils/errorMessages';
import { POLICY_LABELS, availableSlots } from '../utils/groupValidation';
import { colors, spacing } from '../utils/theme';

type GroupMembersScreenProps = {
  groupId: string;
};

export function GroupMembersScreen({ groupId }: GroupMembersScreenProps) {
  const user = useCurrentUser();
  const router = useRouter();
  const { group, loading, error } = useGroup(groupId);
  const profiles = usePublicProfiles(group?.memberIds ?? []);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isOwner = group?.ownerId === user.uid;

  const openProfile = useCallback(
    (uid: string) => router.push({ pathname: '/profile/[uid]', params: { uid } }),
    [router],
  );

  const confirmRemove = useCallback(
    (uid: string) => {
      const name = profiles[uid]?.name ?? 'este integrante';
      Alert.alert('Remover integrante', `Remover ${name} do grupo?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            setRemovingId(uid);
            setActionError(null);
            removeGroupMember(groupId, user.uid, uid)
              .catch((removeError: unknown) => setActionError(getErrorMessage(removeError)))
              .finally(() => setRemovingId(null));
          },
        },
      ]);
    },
    [groupId, profiles, user.uid],
  );

  if (loading) {
    return <Loading message="Carregando integrantes..." />;
  }

  if (!group) {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Grupo indisponível"
        description={error ?? 'O grupo não existe mais ou você foi removido.'}
      />
    );
  }

  const slots = availableSlots(group.memberLimit, group.memberIds.length);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Integrantes' }} />
      <FlatList
        data={group.memberIds}
        keyExtractor={(uid) => uid}
        ListHeaderComponent={
          <View style={styles.header}>
            <Avatar uri={group.photoUrl} name={group.name} size={96} variant="group" />
            <Text style={styles.name}>{group.name}</Text>
            <Text style={styles.info}>
              {group.memberIds.length} de {group.memberLimit} integrantes · {slots === 0 ? 'sem vagas' : `${slots} vaga(s)`}
            </Text>
            <Text style={styles.info}>Notificações: {POLICY_LABELS[group.notificationPolicy].title}</Text>
            {actionError ? <ErrorMessage message={actionError} onDismiss={() => setActionError(null)} /> : null}
            {isOwner ? (
              <View style={styles.editButton}>
                <Button
                  title="Editar grupo"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/group-form', params: { groupId } })}
                />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <GroupMemberItem
            uid={item}
            profile={profiles[item]}
            isOwner={item === group.ownerId}
            isCurrentUser={item === user.uid}
            subtitle={removingId === item ? 'Removendo...' : undefined}
            disabled={removingId === item}
            onPress={openProfile}
            onRemove={isOwner && item !== group.ownerId && removingId === null ? confirmRemove : undefined}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.xs,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  info: {
    color: colors.textMuted,
  },
  editButton: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 72,
  },
});
