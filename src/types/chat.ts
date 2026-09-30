import type { ChatGroup } from './group';
import type { PublicProfile } from './user';

export type ConversationType = 'direct' | 'group';

export type DirectConversation = {
  id: string;
  type: 'direct';
  participants: [string, string];
  createdAt: number;
};

export type MessageTarget =
  | { type: 'conversation' }
  | { type: 'member'; memberId: string };

export type ChatMessage = {
  id: string;
  conversationId: string;
  conversationType: ConversationType;
  senderId: string;
  text: string;
  target: MessageTarget;
  mentionedUserIds: string[];
  createdAt: number;
};

export type SendMessageInput = {
  conversationId: string;
  conversationType: ConversationType;
  senderId: string;
  text: string;
  target: MessageTarget;
  mentionedUserIds: string[];
};

/** Item exibido na tela de conversas. */
export type ConversationSummary =
  | {
      kind: 'direct';
      id: string;
      createdAt: number;
      conversation: DirectConversation;
      otherUser: PublicProfile | null;
      otherUserId: string;
    }
  | {
      kind: 'group';
      id: string;
      createdAt: number;
      group: ChatGroup;
    };
