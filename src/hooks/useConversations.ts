import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  ACTIVE_CONVERSATION_STORAGE_KEY,
  CONVERSATIONS_STORAGE_KEY,
} from '../constants/storage';
import {
  createConversation,
  EMPTY_MESSAGES,
  getInitialConversationState,
} from '../domain/conversations';
import { addLog } from '../logger';
import type { Conversation, Message } from '../types/app';

export interface UseConversationsResult {
  conversations: Conversation[];
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  activeConversationId: string;
  activeConversation: Conversation | null;
  sortedConversations: Conversation[];
  messages: Message[];
  createNewConversation: () => void;
  deleteConversation: (id: string) => void;
  selectConversation: (id: string) => void;
}

export const useConversations = (): UseConversationsResult => {
  const [initialState] = useState(getInitialConversationState);

  const [conversations, setConversations] = useState<Conversation[]>(initialState.conversations);
  const [activeConversationId, setActiveConversationId] = useState(initialState.activeConversationId);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [conversations, activeConversationId],
  );

  const messages = useMemo(() => activeConversation?.messages || EMPTY_MESSAGES, [activeConversation]);

  const sortedConversations = useMemo(
    () => [...conversations].sort((left, right) => right.updatedAt - left.updatedAt),
    [conversations],
  );

  useEffect(() => {
    if (conversations.length === 0) return;
    localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, activeConversationId);
  }, [activeConversationId]);

  const createNewConversation = useCallback(() => {
    const nextConversation = createConversation();
    setConversations((prev) => [nextConversation, ...prev]);
    setActiveConversationId(nextConversation.id);
    addLog('action', 'Created new conversation');
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const filtered = prev.filter((conversation) => conversation.id !== id);
        if (filtered.length === 0) {
          const nextConversation = createConversation();
          setActiveConversationId(nextConversation.id);
          return [nextConversation];
        }

        if (activeConversationId === id) {
          setActiveConversationId(filtered[0].id);
        }

        return filtered;
      });

      addLog('action', `Deleted conversation ${id}`);
    },
    [activeConversationId],
  );

  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  return {
    conversations,
    setConversations,
    activeConversationId,
    activeConversation,
    sortedConversations,
    messages,
    createNewConversation,
    deleteConversation,
    selectConversation,
  };
};
