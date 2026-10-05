import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormScreen } from '../components/FormScreen';
import { GroupMemberItem } from '../components/GroupMemberItem';
import { Loading } from '../components/Loading';
import { PhotoPicker } from '../components/PhotoPicker';
import { PolicySelector } from '../components/PolicySelector';
import { TextField } from '../components/TextField';
import { useCurrentUser } from '../hooks/useAuth';
import { useGroup } from '../hooks/useGroups';
import { usePublicProfiles } from '../hooks/usePublicProfiles';
import { createGroup, updateGroup } from '../services/groupService';
import type { NotificationPolicy } from '../types/group';
import type { PickedImage } from '../types/user';
import { getErrorMessage } from '../utils/errorMessages';
import {
  MAX_GROUP_LIMIT,
  availableSlots,
  parseMemberLimit,
  validateGroupName,
  validateMemberCount,
  validateMemberLimit,
} from '../utils/groupValidation';
import { consumePendingMemberSelection } from '../utils/memberSelection';
import { colors, radius, spacing } from '../utils/theme';

type GroupFormScreenProps = {
  /** Ausente: criação. Presente: edição pelo proprietário. */
  groupId: string | null;
};

const DEFAULT_LIMIT = '10';

export function GroupFormScreen({ groupId }: GroupFormScreenProps) {
  const user = useCurrentUser();
  const router = useRouter();
  const isEditing = groupId !== null;
  const { group, loading: groupLoading, error: groupError } = useGroup(groupId);

  const [name, setName] = useState('');
  const [limitText, setLimitText] = useState(DEFAULT_LIMIT);
  const [policy, setPolicy] = useState<NotificationPolicy>('all_group_messages');
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  /** Integrantes além do proprietário. */
  const [memberIds, setMemberIds] = useState<readonly string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const initialMemberIdsRef = useRef<readonly string[]>([]);

  const ownerId = group?.ownerId ?? user.uid;
  const isOwner = ownerId === user.uid;

  // Na edição, preenche o formulário uma única vez com os dados atuais do grupo.
  useEffect(() => {
    if (group && !initializedRef.current) {
      initializedRef.current = true;
      initialMemberIdsRef.current = [...group.memberIds];
      setName(group.name);
      setLimitText(String(group.memberLimit));
      setPolicy(group.notificationPolicy);
      setMemberIds(group.memberIds.filter((id) => id !== group.ownerId));
    }
  }, [group]);

  // Recebe a seleção feita na Tela de Usuários.
  useFocusEffect(
    useCallback(() => {
      const selection = consumePendingMemberSelection();
      if (selection) {
        setMemberIds(selection.filter((id) => id !== ownerId));
      }
    }, [ownerId]),
  );

  const allMemberIds = useMemo(() => [ownerId, ...memberIds], [ownerId, memberIds]);
  const profiles = usePublicProfiles(allMemberIds);
  const memberLimit = parseMemberLimit(limitText);
  const totalMembers = allMemberIds.length;

  const errors = useMemo(
    () => ({
      name: submitted ? validateGroupName(name) : null,
      limit: validateMemberLimit(memberLimit, totalMembers),
      members: submitted ? validateMemberCount(totalMembers) : null,
    }),
    [submitted, name, memberLimit, totalMembers],
  );

  const slots = memberLimit !== null ? availableSlots(memberLimit, totalMembers) : 0;

  const openMemberSelection = useCallback(() => {
    const effectiveLimit = memberLimit !== null && errors.limit === null ? memberLimit : MAX_GROUP_LIMIT;
    router.push({
      pathname: '/users',
      params: { mode: 'select', selected: memberIds.join(','), max: String(Math.max(0, effectiveLimit - 1)) },
    });
  }, [errors.limit, memberIds, memberLimit, router]);

  const removeMember = useCallback((uid: string) => {
    setMemberIds((current) => current.filter((id) => id !== uid));
  }, []);

  const handleSave = useCallback(async () => {
    setSubmitted(true);
    setError(null);
    const validationError =
      validateGroupName(name) ?? validateMemberCount(totalMembers) ?? validateMemberLimit(memberLimit, totalMembers);
    if (validationError || memberLimit === null) {
      setError(validationError ?? 'Verifique os campos.');
      return;
    }
    setSaving(true);
    try {
      if (isEditing && group) {
        const selected = new Set(allMemberIds);
        await updateGroup(
          group.id,
          user.uid,
          {
            name,
            memberLimit,
            notificationPolicy: policy,
            // Só aplica a intenção deste formulário sobre o grupo mais recente da transação.
            addMemberIds: allMemberIds.filter((id) => !initialMemberIdsRef.current.includes(id)),
            removeMemberIds: initialMemberIdsRef.current.filter((id) => !selected.has(id)),
          },
          photo,
        );
        router.back();
      } else {
        const newGroupId = await createGroup(user.uid, { name, memberIds: [...memberIds], memberLimit, notificationPolicy: policy }, photo);
        router.replace({ pathname: '/chat/[conversationId]', params: { conversationId: newGroupId, type: 'group' } });
      }
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Não foi possível salvar o grupo.'));
      setSaving(false);
    }
  }, [allMemberIds, group, isEditing, memberIds, memberLimit, name, photo, policy, router, totalMembers, user.uid]);

  if (isEditing && groupLoading) {
    return <Loading message="Carregando grupo..." />;
  }

  if (isEditing && (!group || !isOwner)) {
    return (
      <FormScreen>
        <ErrorMessage message={groupError ?? 'Somente o proprietário pode editar este grupo.'} />
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <Stack.Screen options={{ title: isEditing ? 'Editar grupo' : 'Novo grupo' }} />

      <PhotoPicker
        image={photo}
        currentUrl={group?.photoUrl}
        name={name}
        variant="group"
        onChange={setPhoto}
        disabled={saving}
      />

      <TextField label="Nome do grupo" value={name} onChangeText={setName} error={errors.name} editable={!saving} maxLength={60} />

      <TextField
        label="Limite máximo de integrantes (inclui você)"
        value={limitText}
        onChangeText={(text) => setLimitText(text.replace(/\D/g, ''))}
        keyboardType="number-pad"
        error={errors.limit}
        hint={`Entre 2 e ${MAX_GROUP_LIMIT}.`}
        editable={!saving}
      />

      <View style={styles.capacity}>
        <Text style={styles.capacityText}>
          {totalMembers} de {memberLimit ?? '?'} integrantes
        </Text>
        <Text style={[styles.capacityText, slots === 0 && styles.full]}>
          {slots === 0 ? 'Grupo sem vagas' : `${slots} vaga(s) disponível(is)`}
        </Text>
      </View>

      <Text style={styles.section}>Integrantes</Text>
      <View style={styles.list}>
        <GroupMemberItem uid={ownerId} profile={profiles[ownerId]} isOwner isCurrentUser={ownerId === user.uid} />
        {memberIds.map((uid) => (
          <GroupMemberItem
            key={uid}
            uid={uid}
            profile={profiles[uid]}
            onRemove={saving ? undefined : removeMember}
          />
        ))}
      </View>
      {errors.members ? <Text style={styles.errorText}>{errors.members}</Text> : null}
      <View style={styles.spacer}>
        <Button
          title={slots === 0 && memberLimit !== null ? 'Sem vagas: aumente o limite' : 'Adicionar ou alterar integrantes'}
          variant="secondary"
          onPress={openMemberSelection}
          disabled={saving || (slots === 0 && memberIds.length === 0)}
        />
      </View>

      <Text style={styles.section}>Notificações push</Text>
      <PolicySelector value={policy} onChange={setPolicy} disabled={saving} />

      {error ? <ErrorMessage message={error} /> : null}

      <View style={styles.spacer}>
        <Button title={isEditing ? 'Salvar alterações' : 'Criar grupo'} onPress={handleSave} loading={saving} />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  capacity: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    marginBottom: spacing.md,
  },
  capacityText: {
    color: colors.primary,
    fontWeight: '600',
  },
  full: {
    color: colors.danger,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  list: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: {
    color: colors.danger,
    marginTop: spacing.xs,
  },
  spacer: {
    marginTop: spacing.md,
  },
});
