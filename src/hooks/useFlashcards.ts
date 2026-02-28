import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { generateFlashcards } from '../ai-service';
import { FLASHCARDS_STORAGE_KEY } from '../constants/storage';
import {
  createFlashcardsFromGenerated,
  loadStoredFlashcards,
} from '../domain/flashcards';
import { addLog } from '../logger';
import { calculateNextSRSDelay, type SRSData } from '../srs';
import type { Conversation, Flashcard } from '../types/app';

export type FlashcardRating = 0 | 1 | 2 | 3 | 4 | 5;

export interface UseFlashcardsResult {
  flashcards: Flashcard[];
  isFlashcardsView: boolean;
  setIsFlashcardsView: Dispatch<SetStateAction<boolean>>;
  isGeneratingFlashcards: boolean;
  currentCard: Flashcard | null;
  dueCardsCount: number;
  isCardRevealed: boolean;
  revealCard: () => void;
  generateForConversation: (conversation: Conversation | null) => Promise<void>;
  reviewFlashcard: (cardId: string, rating: FlashcardRating) => void;
}

export const useFlashcards = (): UseFlashcardsResult => {
  const [flashcards, setFlashcards] = useState<Flashcard[]>(() => loadStoredFlashcards());
  const [isFlashcardsView, setIsFlashcardsView] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [currentStudyCardId, setCurrentStudyCardId] = useState<string | null>(null);
  const [isCardRevealed, setIsCardRevealed] = useState(false);

  const dueCards = flashcards.filter((card) => card.nextReviewDate <= Date.now());
  const currentCard = currentStudyCardId
    ? flashcards.find((card) => card.id === currentStudyCardId) || dueCards[0] || null
    : dueCards[0] || null;

  useEffect(() => {
    localStorage.setItem(FLASHCARDS_STORAGE_KEY, JSON.stringify(flashcards));
  }, [flashcards]);

  useEffect(() => {
    if (currentCard && currentStudyCardId !== currentCard.id) {
      setCurrentStudyCardId(currentCard.id);
      setIsCardRevealed(false);
    }
  }, [currentCard, currentStudyCardId]);

  const generateForConversation = useCallback(
    async (conversation: Conversation | null) => {
      if (!conversation || isGeneratingFlashcards) return;

      setIsGeneratingFlashcards(true);

      try {
        const topic = conversation.topic || conversation.title;
        const generated = await generateFlashcards(topic, conversation.messages);
        const newCards = createFlashcardsFromGenerated(generated, topic, conversation.id);

        setFlashcards((prev) => [...prev, ...newCards]);
        setIsFlashcardsView(true);
      } finally {
        setIsGeneratingFlashcards(false);
      }
    },
    [isGeneratingFlashcards],
  );

  const reviewFlashcard = useCallback((cardId: string, rating: FlashcardRating) => {
    setFlashcards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card;

        const currentData: SRSData = {
          interval: card.interval,
          repetition: card.repetition,
          easinessFactor: card.easinessFactor,
        };

        const nextData = calculateNextSRSDelay(rating, currentData);

        return {
          ...card,
          ...nextData,
        };
      }),
    );

    setIsCardRevealed(false);
    setCurrentStudyCardId(null);
    addLog('action', `Reviewed flashcard ${cardId} with rating ${rating}`);
  }, []);

  const revealCard = useCallback(() => {
    setIsCardRevealed(true);
  }, []);

  return {
    flashcards,
    isFlashcardsView,
    setIsFlashcardsView,
    isGeneratingFlashcards,
    currentCard,
    dueCardsCount: dueCards.length,
    isCardRevealed,
    revealCard,
    generateForConversation,
    reviewFlashcard,
  };
};
