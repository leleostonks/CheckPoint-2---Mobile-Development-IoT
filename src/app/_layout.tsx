import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../contexts/AuthContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../utils/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function SplashScreenController() {
  const { status } = useAuth();
  useEffect(() => {
    if (status !== 'initializing') {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [status]);
  return null;
}

function RootNavigator() {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const signedOut = status === 'signedOut';

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: 'Conversas' }} />
        <Stack.Screen name="users" options={{ title: 'Usuários' }} />
        <Stack.Screen name="group-form" options={{ title: 'Grupo' }} />
        <Stack.Screen name="chat/[conversationId]" options={{ title: '' }} />
        <Stack.Screen name="profile/[uid]" options={{ title: 'Perfil' }} />
        <Stack.Screen name="group-members/[groupId]" options={{ title: 'Integrantes' }} />
      </Stack.Protected>

      <Stack.Protected guard={signedOut}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: 'Criar conta' }} />
      </Stack.Protected>

      <Stack.Protected guard={!signedIn && !signedOut}>
        <Stack.Screen name="session" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          <SplashScreenController />
          <StatusBar style="dark" />
          <RootNavigator />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
