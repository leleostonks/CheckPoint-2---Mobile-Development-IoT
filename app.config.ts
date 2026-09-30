import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Identificadores nativos. Devem ser os mesmos cadastrados no app Android/iOS do Firebase.
 * Pode ser trocado por variável de ambiente sem editar este arquivo.
 */
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE ?? 'br.com.fiap.chatfirebase';
const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID ?? 'br.com.fiap.chatfirebase';
/** Preenchido por `npx eas-cli init` (ou pela variável EAS_PROJECT_ID). */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? '';

/**
 * Arquivo do app Android no Firebase (necessário para o FCM).
 * Local: coloque `google-services.json` na raiz. No EAS: variável de arquivo GOOGLE_SERVICES_JSON.
 */
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Chat Firebase',
  slug: 'chat-firebase',
  scheme: 'chatfirebase',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: IOS_BUNDLE_ID,
  },
  android: {
    package: ANDROID_PACKAGE,
    googleServicesFile,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#FFFFFF',
      },
    ],
    [
      'expo-notifications',
      {
        color: '#1E6FD9',
        defaultChannel: 'messages',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'O app precisa acessar suas fotos para definir a foto de perfil e do grupo.',
        cameraPermission: false,
      },
    ],
  ],
  extra: {
    eas: EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : {},
  },
});
