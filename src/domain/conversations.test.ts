import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERSATIONS_STORAGE_KEY,
  DEFAULT_CONVERSATION_TITLE,
} from '../constants/storage';
import {
  formatConversationTimestamp,
  loadStoredConversations,
  resetConversationForRetry,
  toConversationTitle,
  toMessagePreview,
} from './conversations';

interface StorageMock {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const createLocalStorageMock = (): StorageMock => {
  const store: Record<string, string> = {};

  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => {
        delete store[key];
      });
    },
  };
};

describe('conversations domain', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-02T12:00:00.000Z'));
    vi.stubGlobal('localStorage', createLocalStorageMock());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('normalizes and truncates conversation titles', () => {
    expect(toConversationTitle('   hello   world   ')).toBe('hello world');

    const longTitle = 'a'.repeat(100);
    const result = toConversationTitle(longTitle);

    expect(result).toHaveLength(52);
    expect(result.endsWith('...')).toBe(true);
  });

  it('builds preview from last non-empty message and truncates long content', () => {
    const preview = toMessagePreview([
      { id: '1', role: 'user', content: '   ' },
      { id: '2', role: 'ai', content: 'x'.repeat(80) },
    ]);

    expect(preview).toBe(`${'x'.repeat(69)}...`);
  });

  it('formats timestamps with time for same day and short date for older day', () => {
    const sameDay = new Date('2024-01-02T09:15:00.000Z').getTime();
    const differentDay = new Date('2024-01-01T09:15:00.000Z').getTime();

    expect(formatConversationTimestamp(sameDay)).toBe(
      new Date(sameDay).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    );
    expect(formatConversationTimestamp(differentDay)).toBe(
      new Date(differentDay).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    );
  });

  it('falls back to a default conversation when storage JSON is malformed', () => {
    localStorage.setItem(CONVERSATIONS_STORAGE_KEY, '{invalid-json');

    const result = loadStoredConversations();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe(DEFAULT_CONVERSATION_TITLE);
  });

  it('normalizes loaded conversation records with fallback title and message shape', () => {
    localStorage.setItem(
      CONVERSATIONS_STORAGE_KEY,
      JSON.stringify([
        {
          messages: [
            { role: 'user', content: '   Intro   topic   ' },
            { role: 'unknown', content: 123 },
          ],
          topic: '   ',
          createdAt: 111,
          updatedAt: 222,
        },
      ]),
    );

    const [result] = loadStoredConversations();

    expect(result.id).toBeTypeOf('string');
    expect(result.title).toBe('Intro topic');
    expect(result.topic).toBeNull();
    expect(result.createdAt).toBe(111);
    expect(result.updatedAt).toBe(222);
    expect(result.messages).toEqual([
      {
        id: expect.any(String),
        role: 'user',
        content: '   Intro   topic   ',
      },
      {
        id: expect.any(String),
        role: 'ai',
        content: '',
      },
    ]);
  });

  it('removes messages after retry point and appends fresh ai placeholder', () => {
    const conversation = {
      id: 'conv-1',
      title: 'Test conversation',
      topic: 'Testing',
      messages: [
        { id: 'u1', role: 'user' as const, content: 'First question' },
        { id: 'a1', role: 'ai' as const, content: 'First answer' },
        { id: 'u2', role: 'user' as const, content: 'Second question' },
        { id: 'a2', role: 'ai' as const, content: 'Second answer' },
        { id: 'u3', role: 'user' as const, content: 'Third question' },
      ],
      createdAt: 100,
      updatedAt: 100,
    };

    const result = resetConversationForRetry(conversation, 'u2', 'ai-retry', 999);

    expect(result).not.toBeNull();
    expect(result?.historyBeforeRetry).toEqual([
      { id: 'u1', role: 'user', content: 'First question' },
      { id: 'a1', role: 'ai', content: 'First answer' },
    ]);

    expect(result?.nextConversation.messages).toEqual([
      { id: 'u1', role: 'user', content: 'First question' },
      { id: 'a1', role: 'ai', content: 'First answer' },
      { id: 'u2', role: 'user', content: 'Second question' },
      { id: 'ai-retry', role: 'ai', content: '' },
    ]);

    expect(result?.nextConversation.updatedAt).toBe(999);
  });
});
