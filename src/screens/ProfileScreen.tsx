import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { useCurrentUser } from '../hooks/useAuth';
import { fetchUserProfile } from '../services/userService';
import type { ChatUser } from '../types/user';
import { getErrorMessage } from '../utils/errorMessages';
import { formatBirthDate } from '../utils/formatters';
import { colors, radius, spacing } from '../utils/theme';

type ProfileScreenProps = {
  uid: string;
};

type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: ChatUser };

const UNAVAILABLE = 'Não informado';

function ProfileField({
  icon,
  label,
  value,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  const available = value.trim().length > 0;
  return (
    <View style={styles.field}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={styles.fieldTexts}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={[styles.fieldValue, !available && styles.unavailable]}>{available ? value : UNAVAILABLE}</Text>
      </View>
    </View>
  );
}

export function ProfileScreen({ uid }: ProfileScreenProps) {
  const user = useCurrentUser();
  const [attempt, setAttempt] = useState(0);
  const [entry, setEntry] = useState<{ key: string; state: ProfileState } | null>(null);
  const requestKey = `${uid}#${attempt}`;
  const state: ProfileState = entry?.key === requestKey ? entry.state : { status: 'loading' };

  useEffect(() => {
    let cancelled = false;
    const report = (next: ProfileState) => {
      if (!cancelled) {
        setEntry({ key: requestKey, state: next });
      }
    };
    fetchUserProfile(uid, user.uid)
      .then((profile) => report({ status: 'ready', profile }))
      .catch((error: unknown) =>
        report({ status: 'error', message: getErrorMessage(error, 'Não foi possível carregar o perfil.') }),
      );
    return () => {
      cancelled = true;
    };
  }, [uid, user.uid, requestKey]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (state.status === 'loading') {
    return <Loading message="Carregando perfil..." />;
  }

  if (state.status === 'error') {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ title: 'Perfil' }} />
        <ErrorMessage message={state.message} />
        <Button title="Tentar novamente" variant="secondary" onPress={retry} />
      </View>
    );
  }

  const { profile } = state;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: uid === user.uid ? 'Meu perfil' : 'Perfil' }} />
      <View style={styles.header}>
        <Avatar uri={profile.photoUrl} name={profile.name} size={120} />
        <Text style={styles.name}>{profile.name.trim() || UNAVAILABLE}</Text>
      </View>
      <View style={styles.card}>
        <ProfileField icon="mail-outline" label="E-mail" value={profile.email} />
        <ProfileField icon="call-outline" label="Celular" value={profile.phoneNumber} />
        <ProfileField icon="calendar-outline" label="Data de nascimento" value={formatBirthDate(profile.birthDate)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  errorContainer: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  fieldTexts: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  fieldValue: {
    fontSize: 16,
    color: colors.text,
  },
  unavailable: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
