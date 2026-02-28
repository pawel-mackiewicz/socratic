import ReactMarkdown from 'react-markdown';
import type { Flashcard } from '../types/app';
import type { FlashcardRating } from '../hooks/useFlashcards';

interface FlashcardsPanelProps {
  currentCard: Flashcard | null;
  flashcardsCount: number;
  isCardRevealed: boolean;
  onRevealAnswer: () => void;
  onReviewFlashcard: (cardId: string, rating: FlashcardRating) => void;
}

export function FlashcardsPanel({
  currentCard,
  flashcardsCount,
  isCardRevealed,
  onRevealAnswer,
  onReviewFlashcard,
}: FlashcardsPanelProps) {
  return (
    <div className="flashcards-area">
      {currentCard ? (
        <div className="flashcard-study-container">
          <div className="flashcard">
            <div className="flashcard-front">
              <h3>Question</h3>
              <div className="prose">
                <ReactMarkdown>{currentCard.front}</ReactMarkdown>
              </div>
            </div>

            {isCardRevealed ? (
              <div className="flashcard-back">
                <hr />
                <h3>Answer</h3>
                <div className="prose">
                  <ReactMarkdown>{currentCard.back}</ReactMarkdown>
                </div>

                <div className="srs-controls">
                  <p>How well did you know this?</p>
                  <div className="srs-buttons">
                    <button className="srs-btn srs-btn-1" onClick={() => onReviewFlashcard(currentCard.id, 0)}>
                      Blackout <small>Reset</small>
                    </button>
                    <button className="srs-btn srs-btn-2" onClick={() => onReviewFlashcard(currentCard.id, 1)}>
                      Wrong <small>Remembered</small>
                    </button>
                    <button className="srs-btn srs-btn-3" onClick={() => onReviewFlashcard(currentCard.id, 2)}>
                      Wrong <small>Effortless</small>
                    </button>
                    <button className="srs-btn srs-btn-4" onClick={() => onReviewFlashcard(currentCard.id, 3)}>
                      Hard <small>Struggled</small>
                    </button>
                    <button className="srs-btn srs-btn-5" onClick={() => onReviewFlashcard(currentCard.id, 4)}>
                      Good <small>Standard</small>
                    </button>
                    <button className="srs-btn srs-btn-6" onClick={() => onReviewFlashcard(currentCard.id, 5)}>
                      Easy <small>Perfect</small>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flashcard-reveal-container">
                <button className="btn-primary" onClick={onRevealAnswer}>
                  Reveal Answer
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flashcards-empty">
          <div className="setup-icon">🎉</div>
          <h3>All caught up!</h3>
          <p>You have {flashcardsCount} total flashcards, and 0 due right now.</p>
          <p>Review more conversations and generate more cards to accelerate your learning.</p>
        </div>
      )}
    </div>
  );
}
