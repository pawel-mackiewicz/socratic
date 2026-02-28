import { FLASHCARDS_STORAGE_KEY } from '../constants/storage';
import type { Flashcard } from '../types/app';
import { createId } from '../utils/id';

interface GeneratedFlashcard {
  front: string;
  back: string;
}

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
