import {
  useCallback,
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from 'react';
import { sendMessageToAI, type ChatMessage } from '../ai-service';
import { toConversationTitle } from '../domain/conversations';
import { addLog } from '../logger';
import type { Conversation } from '../types/app';
import { createId } from '../utils/id';

interface UseChatParams {
  activeConversation: Conversation | null;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
}

export interface UseChatResult {
  inputValue: string;
  setInputValue: Dispatch<SetStateAction<string>>;
  isLoading: boolean;
  sendMessage: (e?: FormEvent) => Promise<void>;
  handleInputEnter: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

export const useChat = ({
  activeConversation,
  setConversations,
}: UseChatParams): UseChatResult => {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault();
      if (!inputValue.trim() || isLoading || !activeConversation) return;

      const userText = inputValue.trim();
      const currentConversationId = activeConversation.id;
      const historyBeforeSend: ChatMessage[] = activeConversation.messages.map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));

      setInputValue('');
      addLog('action', 'Sent message in conversation');

      const newUserMessage = { id: createId(), role: 'user' as const, content: userText };
      const aiMessageId = createId();

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== currentConversationId) return conversation;

          return {
            ...conversation,
            topic: conversation.topic || userText,
            title: conversation.messages.length === 0 ? toConversationTitle(userText) : conversation.title,
            messages: [
              ...conversation.messages,
              newUserMessage,
              { id: aiMessageId, role: 'ai' as const, content: '' },
            ],
            updatedAt: Date.now(),
          };
        }),
      );

      setIsLoading(true);

      try {
        await sendMessageToAI(userText, historyBeforeSend, (chunk) => {
          setConversations((prev) =>
            prev.map((conversation) => {
              if (conversation.id !== currentConversationId) return conversation;

              return {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === aiMessageId ? { ...message, content: chunk } : message,
                ),
                updatedAt: Date.now(),
              };
            }),
          );
        });
      } catch {
        setConversations((prev) =>
          prev.map((conversation) => {
            if (conversation.id !== currentConversationId) return conversation;

            return {
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === aiMessageId
                  ? { ...message, content: '⚠️ *Error communicating with Gemini. Please try again.*' }
                  : message,
              ),
              updatedAt: Date.now(),
            };
          }),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [activeConversation, inputValue, isLoading, setConversations],
  );

  const handleInputEnter = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage],
  );

  return {
    inputValue,
    setInputValue,
    isLoading,
    sendMessage,
    handleInputEnter,
  };
};
