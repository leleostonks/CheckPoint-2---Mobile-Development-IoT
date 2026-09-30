import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormScreen } from '../components/FormScreen';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../utils/errorMessages';
import { colors, spacing } from '../utils/theme';

export function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (loginError) {
      setError(getErrorMessage(loginError, 'Não foi possível entrar.'));
      setLoading(false);
    }
  }, [email, password, signIn]);

  return (
    <SafeAreaView style={styles.safe}>
      <FormScreen>
        <View style={styles.header}>
          <Ionicons name="chatbubbles" size={64} color={colors.primary} />
          <Text style={styles.title}>Chat Firebase</Text>
          <Text style={styles.subtitle}>Entre com seu e-mail e senha</Text>
        </View>

        <TextField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="voce@email.com"
          editable={!loading}
        />
        <TextField
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          placeholder="Sua senha"
          editable={!loading}
          onSubmitEditing={handleLogin}
        />

        {error ? <ErrorMessage message={error} /> : null}

        <View style={styles.actions}>
          <Button title="Entrar" onPress={handleLogin} loading={loading} />
          <Pressable onPress={() => router.push('/register')} disabled={loading} style={styles.link}>
            <Text style={styles.linkText}>Não tem conta? Criar conta</Text>
          </Pressable>
        </View>
      </FormScreen>
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
    marginTop: spacing.xl * 2,
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
  },
  actions: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  link: {
    alignItems: 'center',
    padding: spacing.sm,
  },
  linkText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
