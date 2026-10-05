import { StyleSheet, View } from 'react-native';

import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { useAuth } from '../hooks/useAuth';
import { useSignOut } from '../hooks/useNotifications';
import { colors, spacing } from '../utils/theme';

/** Estados intermediários da sessão: carregando o perfil ou conta sem perfil gravado. */
export default function SessionRoute() {
  const { status } = useAuth();
  const signOut = useSignOut();

  if (status === 'initializing' || status === 'loadingProfile') {
    return <Loading message="Carregando sua conta..." />;
  }

  const message =
    status === 'missingProfile'
      ? 'Seu cadastro está incompleto. Saia e crie a conta novamente.'
      : 'Não foi possível carregar seu perfil. Verifique a conexão e entre novamente.';

  return (
    <View style={styles.container}>
      <ErrorMessage message={message} />
      <Button title="Sair" variant="danger" onPress={() => signOut().catch(() => console.warn('Não foi possível encerrar a sessão.'))} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
});
