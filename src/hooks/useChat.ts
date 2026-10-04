import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { requestMessagePush, sendMessage, subscribeLastMessage, subscribeMessages } from '../services/chatService';
import { syncGroupMembers } from '../services/groupService';
import type { ChatMessage, ConversationType, MessageTarget } from '../types/chat';
import { getErrorMessage, isPermissionDenied } from '../utils/errorMessages';

type UseChatParams = {
  conversationId: string;
  conversationType: ConversationType;
  currentUid: string;
};

export type SendOptions = {
  text: string;
  target: MessageTarget;
  mentionedUserIds: string[];
};

type UseChatResult = {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  sendError: string | null;
  pushWarning: string | null;
  send: (options: SendOptions) => Promise<boolean>;
  clearSendError: () => void;
};

const LAST_MESSAGE_RETRIES = 5;
const LAST_MESSAGE_RETRY_MS = 3000;

/** Última mensagem da conversa, para a prévia na lista. Falhas silenciosas: a prévia é opcional. */
export function useLastMessage(conversationId: string): ChatMessage | null {
  const [message, setMessage] = useState<ChatMessage | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeLastMessage(conversationId, setMessage, (error) => {
      setMessage(null);
      // Grupo recém-criado: o espelho de integrantes chega pela API logo depois; tenta ouvir de novo.
      if (isPermissionDenied(error) && attempt < LAST_MESSAGE_RETRIES) {
        retryTimer = setTimeout(() => setAttempt((value) => value + 1), LAST_MESSAGE_RETRY_MS);
      }
    });
    return () => {
      clearTimeout(retryTimer);
      unsubscribe();
    };
  }, [conversationId, attempt]);

  return message;
}

/** Estado do listener de mensagens, associado à assinatura (conversa + tentativa) que o produziu. */
type MessageFeed = {
  key: string;
  messages: ChatMessage[];
  error: string | null;
};

export function useChat({ conversationId, conversationType, currentUid }: UseChatParams): UseChatResult {
  const [feed, setFeed] = useState<MessageFeed | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pushWarning, setPushWarning] = useState<string | null>(null);
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const syncAttemptedRef = useRef(false);

  const feedKey = `${conversationId}#${subscriptionAttempt}`;
  const currentFeed = feed?.key === feedKey ? feed : null;

  // Listener em tempo real; removido ao desmontar a tela ou trocar de conversa.
  useEffect(() => {
    const unsubscribe = subscribeMessages(
      conversationId,
      (items) => setFeed({ key: feedKey, messages: items, error: null }),
      (subscriptionError) => {
        const fail = (message: string) => setFeed({ key: feedKey, messages: [], error: message });
        // Grupo recém-criado/alterado: o espelho de integrantes pode ainda não existir no Realtime Database.
        if (conversationType === 'group' && isPermissionDenied(subscriptionError) && !syncAttemptedRef.current) {
          syncAttemptedRef.current = true;
          syncGroupMembers(conversationId)
            .then(() => setSubscriptionAttempt((value) => value + 1))
            .catch(() => fail('Você não tem acesso a esta conversa.'));
          return;
        }
        fail(
          isPermissionDenied(subscriptionError)
            ? 'Você não tem acesso a esta conversa.'
            : getErrorMessage(subscriptionError, 'Não foi possível carregar as mensagens.'),
        );
      },
    );
    return unsubscribe;
  }, [conversationId, conversationType, feedKey]);

  const messages = useMemo(() => currentFeed?.messages ?? [], [currentFeed]);
  const loading = currentFeed === null;
  const error = currentFeed?.error ?? null;

  const send = useCallback(
    async ({ text, target, mentionedUserIds }: SendOptions): Promise<boolean> => {
      setSending(true);
      setSendError(null);
      setPushWarning(null);
      let messageId: string;
      try {
        messageId = await sendMessage({
          conversationId,
          conversationType,
          senderId: currentUid,
          text,
          target,
          mentionedUserIds,
        });
      } catch (sendFailure) {
        setSendError(getErrorMessage(sendFailure, 'Falha ao enviar a mensagem.'));
        return false;
      } finally {
        setSending(false);
      }

      // A mensagem já está salva; o push é solicitado à API sem bloquear a conversa.
      requestMessagePush(conversationId, messageId).catch((pushFailure: unknown) => {
        setPushWarning(getErrorMessage(pushFailure, 'Mensagem enviada, mas a notificação não pôde ser disparada.'));
      });
      return true;
    },
    [conversationId, conversationType, currentUid],
  );

  const clearSendError = useCallback(() => {
    setSendError(null);
    setPushWarning(null);
  }, []);

  return { messages, loading, error, sending, sendError, pushWarning, send, clearSendError };
}
