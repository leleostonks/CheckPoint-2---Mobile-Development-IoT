import type { ConversationType } from './chat';
import type { NotificationPolicy } from './group';

export type NotificationSettings = {
  conversationId: string;
  policy: NotificationPolicy;
  updatedBy: string;
  updatedAt: number;
};

/** `fcm`: token nativo do Android enviado via FCM. `expo`: token do Expo Push Service (iOS). */
export type PushTokenType = 'fcm' | 'expo';

export type DeviceRegistration = {
  token: string;
  tokenType: PushTokenType;
  platform: 'android' | 'ios';
  enabled: boolean;
  updatedAt: number;
};

export type PushNotificationData = {
  conversationId: string;
  conversationType: ConversationType;
};

export type NotificationStatus =
  | { state: 'idle' }
  | { state: 'registering' }
  | { state: 'registered'; token: string }
  | { state: 'permission-denied' }
  | { state: 'unavailable'; reason: string }
  | { state: 'error'; message: string };

export type PushDispatchResult = {
  status: 'sent' | 'duplicate' | 'skipped';
  recipients: number;
  delivered: number;
};
