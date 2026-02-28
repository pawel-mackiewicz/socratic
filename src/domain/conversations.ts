import {
  ACTIVE_CONVERSATION_STORAGE_KEY,
  CONVERSATIONS_STORAGE_KEY,
  DEFAULT_CONVERSATION_TITLE,
  MAX_CONVERSATION_TITLE_LENGTH,
} from '../constants/storage';
import type { Conversation, Message } from '../types/app';
import { createId } from '../utils/id';

export const EMPTY_MESSAGES: Message[] = [];

export const toConversationTitle = (value: string): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return DEFAULT_CONVERSATION_TITLE;
  if (normalized.length <= MAX_CONVERSATION_TITLE_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 3)}...`;
};

export const toMessagePreview = (messages: Message[]): string => {
  const lastWithContent = [...messages].reverse().find((entry) => entry.content.trim().length > 0);
  if (!lastWithContent) return 'No messages yet';

  const normalized = lastWithContent.content.trim().replace(/\s+/g, ' ');
  if (normalized.length <= 72) return normalized;
  return `${normalized.slice(0, 69)}...`;
};

export const formatConversationTimestamp = (value: number): string => {
  const date = new Date(value);
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const normalizeMessages = (value: unknown): Message[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (entry): entry is { id?: unknown; role?: unknown; content?: unknown } =>
        typeof entry === 'object' && entry !== null,
    )
    .map((entry) => ({
      id: typeof entry.id === 'string' && entry.id ? entry.id : createId(),
      role: entry.role === 'user' ? 'user' : 'ai',
      content: typeof entry.content === 'string' ? entry.content : '',
    }));
};

export interface RetryConversationResult {
  nextConversation: Conversation;
  selectedMessage: Message;
  historyBeforeRetry: Message[];
}

export const resetConversationForRetry = (
  conversation: Conversation,
  messageId: string,
  aiMessageId: string,
  timestamp = Date.now(),
): RetryConversationResult | null => {
  const retryIndex = conversation.messages.findIndex(
    (message) => message.id === messageId && message.role === 'user',
  );

  if (retryIndex < 0) return null;

  const selectedMessage = conversation.messages[retryIndex];
  const userText = selectedMessage.content;
  if (!userText.trim()) return null;

  const messagesAtRetryPoint = conversation.messages.slice(0, retryIndex + 1);

  return {
    selectedMessage,
    historyBeforeRetry: conversation.messages.slice(0, retryIndex),
    nextConversation: {
      ...conversation,
      topic: conversation.topic || userText,
      title: messagesAtRetryPoint.length === 1 ? toConversationTitle(userText) : conversation.title,
      messages: [...messagesAtRetryPoint, { id: aiMessageId, role: 'ai', content: '' }],
      updatedAt: timestamp,
    },
  };
};

export const createConversation = (): Conversation => {
  const now = Date.now();
  return {
    id: createId(),
    title: DEFAULT_CONVERSATION_TITLE,
    topic: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
};

export const loadStoredConversations = (): Conversation[] => {
  const raw = localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
  if (!raw) return [createConversation()];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [createConversation()];

    const normalized = parsed
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map((entry) => {
        const messages = normalizeMessages(entry.messages);
        const fallbackTitle = messages.find((msg) => msg.role === 'user')?.content || '';
        const createdAt = Number.isFinite(entry.createdAt) ? Number(entry.createdAt) : Date.now();
        const updatedAt = Number.isFinite(entry.updatedAt) ? Number(entry.updatedAt) : createdAt;

        return {
          id: typeof entry.id === 'string' && entry.id ? entry.id : createId(),
          title:
            typeof entry.title === 'string' && entry.title.trim()
              ? toConversationTitle(entry.title)
              : toConversationTitle(fallbackTitle),
          topic: typeof entry.topic === 'string' && entry.topic.trim() ? entry.topic : null,
          messages,
          createdAt,
          updatedAt,
        };
      });

    return normalized.length > 0 ? normalized : [createConversation()];
  } catch {
    return [createConversation()];
  }
};

export const getInitialConversationState = (): {
  conversations: Conversation[];
  activeConversationId: string;
} => {
  const conversations = loadStoredConversations();
  const storedActiveConversationId = localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
  const activeConversationId =
    storedActiveConversationId &&
    conversations.some((conversation) => conversation.id === storedActiveConversationId)
      ? storedActiveConversationId
      : conversations[0].id;

  return {
    conversations,
    activeConversationId,
  };
};
