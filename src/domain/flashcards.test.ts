import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLASHCARDS_STORAGE_KEY } from '../constants/storage';
import {
  annotateFlashcardDrafts,
  buildFlashcardFrontKeySet,
  createTopicConversationId,
  createFlashcardsFromGenerated,
  hasRequiredFlashcardFields,
  loadStoredFlashcards,
  normalizeFlashcardFrontKey,
  normalizeFlashcardText,
} from './flashcards';

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

describe('flashcards domain', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-02T12:00:00.000Z'));
    vi.stubGlobal('localStorage', createLocalStorageMock());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns empty list when stored flashcards JSON is invalid', () => {
    localStorage.setItem(FLASHCARDS_STORAGE_KEY, '{broken-json');

    expect(loadStoredFlashcards()).toEqual([]);
  });

  it('loads stored flashcards when JSON is valid', () => {
    const stored = [
      {
        id: 'f1',
        front: 'Q',
        back: 'A',
        topic: 'Topic',
        conversationId: 'c1',
        interval: 1,
        repetition: 2,
        easinessFactor: 2.5,
        nextReviewDate: 100,
      },
    ];

    localStorage.setItem(FLASHCARDS_STORAGE_KEY, JSON.stringify(stored));

    expect(loadStoredFlashcards()).toEqual(stored);
  });

  it('maps generated flashcards with expected default SRS fields', () => {
    const generated = [
      { front: 'What is closure?', back: 'A closure captures lexical scope.' },
      { front: 'What is hoisting?', back: 'Variable/function declarations are moved to top of scope.' },
    ];

    const result = createFlashcardsFromGenerated(generated, 'JavaScript', 'conv-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      front: generated[0].front,
      back: generated[0].back,
      topic: 'JavaScript',
      conversationId: 'conv-1',
      interval: 0,
      repetition: 0,
      easinessFactor: 2.5,
      nextReviewDate: Date.now(),
    });
    expect(result[0].id).toBeTypeOf('string');
  });

  it('normalizes flashcard text and front key', () => {
    expect(normalizeFlashcardText('  What   is   closure?  ')).toBe('What is closure?');
    expect(normalizeFlashcardFrontKey('  What   is   closure?  ')).toBe('what is closure');
  });

  it('validates required flashcard fields', () => {
    expect(hasRequiredFlashcardFields({ front: 'Q', back: 'A' })).toBe(true);
    expect(hasRequiredFlashcardFields({ front: '   ', back: 'A' })).toBe(false);
    expect(hasRequiredFlashcardFields({ front: 'Q', back: '   ' })).toBe(false);
  });

  it('creates deterministic synthetic topic conversation id', () => {
    expect(createTopicConversationId('  JavaScript   Basics  ')).toBe('topic:javascript-basics');
    expect(createTopicConversationId('   ')).toBe('topic:untitled');
  });

  it('annotates drafts with duplicate and incomplete markers', () => {
    const existing = buildFlashcardFrontKeySet([{ front: 'What is closure?' }]);
    const drafts = annotateFlashcardDrafts(
      [
        {
          id: 'd1',
          front: 'What is closure?',
          back: 'Captures lexical scope.',
          topic: 'JS',
          conversationId: 'topic:js',
        },
        {
          id: 'd2',
          front: 'What is hoisting?',
          back: ' ',
          topic: 'JS',
          conversationId: 'topic:js',
        },
        {
          id: 'd3',
          front: 'What is Hoisting?',
          back: 'Declarations are processed before execution.',
          topic: 'JS',
          conversationId: 'topic:js',
        },
      ],
      existing,
    );

    expect(drafts[0]).toMatchObject({ isDuplicate: true, isIncomplete: false });
    expect(drafts[1]).toMatchObject({ isDuplicate: false, isIncomplete: true });
    expect(drafts[2]).toMatchObject({ isDuplicate: true, isIncomplete: false });
  });
});
