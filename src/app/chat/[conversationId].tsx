import { useLocalSearchParams } from 'expo-router';

import { ChatScreen } from '../../screens/ChatScreen';
import type { ConversationType } from '../../types/chat';
import { isDirectConversationId } from '../../utils/conversationId';

type ChatRouteParams = {
  conversationId: string;
  type?: ConversationType;
};

export default function ChatRoute() {
  const { conversationId } = useLocalSearchParams<ChatRouteParams>();
  // O tipo é derivado do id (conversas individuais começam com "direct_"), então links de push sempre funcionam.
  const conversationType: ConversationType = isDirectConversationId(conversationId) ? 'direct' : 'group';
  return <ChatScreen key={conversationId} conversationId={conversationId} conversationType={conversationType} />;
}
