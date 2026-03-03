import { FLASHCARDS_STORAGE_KEY } from '../constants/storage';
import type { Flashcard } from '../types/app';
import { createId } from '../utils/id';

interface GeneratedFlashcard {
  front: string;
  back: string;
}

export const normalizeFlashcardText = (value: string): string => value.trim().replace(/\s+/g, ' ');

export const normalizeFlashcardFrontKey = (value: string): string => {
  const normalized = normalizeFlashcardText(value).toLowerCase();
  return normalized.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
};

export const hasRequiredFlashcardFields = (entry: GeneratedFlashcard): boolean => {
  return (
    normalizeFlashcardText(entry.front).length > 0 &&
    normalizeFlashcardText(entry.back).length > 0
  );
};

export const buildFlashcardFrontKeySet = (cards: Array<{ front: string }>): Set<string> => {
  return new Set(
    cards
      .map((card) => normalizeFlashcardFrontKey(card.front))
      .filter((key) => key.length > 0),
  );
};

export const createTopicConversationId = (topic: string): string => {
  const normalized = normalizeFlashcardText(topic).toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `topic:${slug || 'untitled'}`;
};

export const annotateFlashcardDrafts = <
  T extends { front: string; back: string }
>(
  drafts: T[],
  existingFrontKeys: Set<string>,
): Array<T & { isDuplicate: boolean; isIncomplete: boolean }> => {
  const seen = new Set<string>();

  return drafts.map((draft) => {
    const front = normalizeFlashcardText(draft.front);
    const back = normalizeFlashcardText(draft.back);
    const frontKey = normalizeFlashcardFrontKey(front);
    const isDuplicate = frontKey.length > 0 && (existingFrontKeys.has(frontKey) || seen.has(frontKey));
    if (frontKey.length > 0 && !seen.has(frontKey)) {
      seen.add(frontKey);
    }

    return {
      ...draft,
      front,
      back,
      isDuplicate,
      isIncomplete: !hasRequiredFlashcardFields({ front, back }),
    };
  });
};

export const loadStoredFlashcards = (): Flashcard[] => {
  const raw = localStorage.getItem(FLASHCARDS_STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as Flashcard[];
  } catch {
    return [];
  }
};

export const createFlashcardsFromGenerated = (
  generated: GeneratedFlashcard[],
  topic: string,
  conversationId: string,
): Flashcard[] => {
  return generated.map((card) => ({
    id: createId(),
    front: card.front,
    back: card.back,
    topic,
    conversationId,
    interval: 0,
    repetition: 0,
    easinessFactor: 2.5,
    nextReviewDate: Date.now(),
  }));
};
