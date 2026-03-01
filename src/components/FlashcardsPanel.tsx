import { useState, useEffect, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import confetti from 'canvas-confetti';
import type { Flashcard } from '../types/app';
import type {
  FlashcardRating,
  PendingFlashcardEvaluation,
} from '../hooks/useFlashcards';
import './FlashcardsPanel.css';
interface FlashcardsPanelProps {
  currentCard: Flashcard | null;
  flashcardsCount: number;
  isEvaluatingAnswer: boolean;
  evaluationError: string | null;
  pendingEvaluation: PendingFlashcardEvaluation | null;
  requiresCorrection: boolean;
  isCorrectionSubmitted: boolean;
  correctedAnswer: string;
  onSubmitAnswerForEvaluation: (card: Flashcard, userAnswer: string) => Promise<void>;
  onSubmitCorrection: (answer: string) => void;
  onAcceptEvaluationAndContinue: () => void;
  onReviewFlashcard: (cardId: string, rating: FlashcardRating) => void;
}

const SCORE_META: Record<FlashcardRating, { title: string; toneClassName: string }> = {
  0: { title: '0 - Blackout', toneClassName: 'score-0' },
  1: { title: '1 - Wrong', toneClassName: 'score-1' },
  2: { title: '2 - Partial', toneClassName: 'score-2' },
  3: { title: '3 - Hard', toneClassName: 'score-3' },
  4: { title: '4 - Good', toneClassName: 'score-4' },
  5: { title: '5 - Easy', toneClassName: 'score-5' },
};

export function FlashcardsPanel({
  currentCard,
  flashcardsCount,
  isEvaluatingAnswer,
  evaluationError,
  pendingEvaluation,
  requiresCorrection,
  isCorrectionSubmitted,
  correctedAnswer,
  onSubmitAnswerForEvaluation,
  onSubmitCorrection,
  onAcceptEvaluationAndContinue,
  onReviewFlashcard,
}: FlashcardsPanelProps) {
  const [typedAnswer, setTypedAnswer] = useState('');
  const [correctionInput, setCorrectionInput] = useState('');
  const canSubmitAnswer = !isEvaluatingAnswer && typedAnswer.trim().length > 0;
  const canSubmitCorrection = correctionInput.trim().length > 0;

  useEffect(() => {
    if (pendingEvaluation?.score === 5) {
      const duration = 2000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#3b82f6', '#93c5fd', '#ffffff', '#e2e8f0']
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#3b82f6', '#93c5fd', '#ffffff', '#e2e8f0']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [pendingEvaluation]);

  const handleSubmitAnswer = (e: FormEvent) => {
    e.preventDefault();
    if (!currentCard) return;
    void onSubmitAnswerForEvaluation(currentCard, typedAnswer);
  };

  const handleAnswerKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || !e.ctrlKey) return;
    e.preventDefault();
    if (!currentCard || !canSubmitAnswer) return;
    void onSubmitAnswerForEvaluation(currentCard, typedAnswer);
  };

  const handleSubmitCorrection = (e: FormEvent) => {
    e.preventDefault();
    onSubmitCorrection(correctionInput);
  };

  const handleCorrectionKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || !e.ctrlKey) return;
    e.preventDefault();
    if (!canSubmitCorrection) return;
    onSubmitCorrection(correctionInput);
  };

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

            {pendingEvaluation ? (
              <div className="flashcard-feedback">
                <div className={`flashcard-score-banner ${SCORE_META[pendingEvaluation.score].toneClassName}`}>
                  <div className="flashcard-score-content">
                    <h3>Evaluation Result</h3>
                    <span className="flashcard-score-badge">
                      {SCORE_META[pendingEvaluation.score].title}
                    </span>
                  </div>
                </div>

                <div className="flashcard-feedback-layout">
                  <div className="flashcard-feedback-side">
                    <div className="flashcard-feedback-block user-answer-block">
                      <h3>Your Answer</h3>
                      <div className="prose">
                        <ReactMarkdown>{pendingEvaluation.userAnswer}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                  <div className="flashcard-feedback-side">
                    <div className="flashcard-feedback-block reference-block">
                      <h3>Reference Answer</h3>
                      <div className="prose">
                        <ReactMarkdown>{currentCard.back}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flashcard-feedback-block argumentation-block">
                  <h3>Argumentation</h3>
                  <div className="prose">
                    <ReactMarkdown>{pendingEvaluation.argumentation}</ReactMarkdown>
                  </div>
                </div>

                <div className="flashcard-feedback-block tips-block">
                  <h3>Tips</h3>
                  <ul className="flashcard-tips-list">
                    {pendingEvaluation.tips.map((tip, index) => (
                      <li key={`${pendingEvaluation.cardId}-tip-${index}`}>
                        <span className="tip-icon">💡</span>
                        <span className="tip-text">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {requiresCorrection ? (
                  <div className="flashcard-correction-block">
                    <h3>Correction Required</h3>
                    <p>
                      Score is 3 or below. Rewrite your answer using the tips above before continuing.
                    </p>
                    {isCorrectionSubmitted ? (
                      <div className="flashcard-correction-saved">
                        <h3>Corrected Answer Submitted</h3>
                        <div className="prose">
                          <ReactMarkdown>{correctedAnswer}</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <form className="flashcard-correction-form" onSubmit={handleSubmitCorrection}>
                        <textarea
                          className="flashcard-answer-input"
                          value={correctionInput}
                          onChange={(event) => setCorrectionInput(event.target.value)}
                          onKeyDown={handleCorrectionKeyDown}
                          placeholder="Write your corrected answer based on the tips..."
                          rows={5}
                        />
                        <button
                          className="btn-primary"
                          type="submit"
                          disabled={!canSubmitCorrection}
                        >
                          Submit Correction <small>(Ctrl+Enter)</small>
                        </button>
                      </form>
                    )}
                  </div>
                ) : null}

                <div className="flashcard-feedback-actions">
                  {requiresCorrection && !isCorrectionSubmitted ? (
                    <p className="flashcard-correction-warning">
                      Submit a corrected answer to unlock the next card.
                    </p>
                  ) : null}
                  <button
                    className="btn-primary"
                    onClick={onAcceptEvaluationAndContinue}
                    disabled={requiresCorrection && !isCorrectionSubmitted}
                  >
                    Next Card
                  </button>
                </div>
              </div>
            ) : (
              <div className="flashcard-answer-step">
                <form className="flashcard-answer-form" onSubmit={handleSubmitAnswer}>
                  <h3>Your Answer</h3>
                  <textarea
                    className="flashcard-answer-input"
                    value={typedAnswer}
                    onChange={(event) => setTypedAnswer(event.target.value)}
                    onKeyDown={handleAnswerKeyDown}
                    placeholder="Type your answer..."
                    rows={6}
                    disabled={isEvaluatingAnswer}
                  />
                  <div className="flashcard-submit-row">
                    <button
                      className={`btn-primary ${isEvaluatingAnswer ? 'is-loading' : ''}`}
                      type="submit"
                      disabled={!canSubmitAnswer}
                    >
                      {isEvaluatingAnswer ? (
                        <>Evaluating<span className="loading-dots">...</span></>
                      ) : evaluationError ? (
                        'Retry Evaluation'
                      ) : (
                        <>Evaluate My Answer <small>(Ctrl+Enter)</small></>
                      )}
                    </button>
                  </div>
                </form>

                {evaluationError ? (
                  <div className="flashcard-evaluation-error" role="alert">
                    <p>{evaluationError}</p>
                    <div className="srs-controls">
                      <p>LLM evaluation failed. You can still rate manually.</p>
                      <div className="srs-buttons-group">
                        <div className="srs-fail-zone">
                          <button className="srs-btn srs-btn-1" onClick={() => onReviewFlashcard(currentCard.id, 0)}>
                            Blackout <span>(Reset)</span>
                          </button>
                          <button className="srs-btn srs-btn-2" onClick={() => onReviewFlashcard(currentCard.id, 1)}>
                            Wrong <span>(Remembered)</span>
                          </button>
                          <button className="srs-btn srs-btn-3" onClick={() => onReviewFlashcard(currentCard.id, 2)}>
                            Wrong <span>(Effortless)</span>
                          </button>
                        </div>
                        <div className="srs-pass-zone">
                          <button className="srs-btn srs-btn-4" onClick={() => onReviewFlashcard(currentCard.id, 3)}>
                            Hard <span>(Struggled)</span>
                          </button>
                          <button className="srs-btn srs-btn-5" onClick={() => onReviewFlashcard(currentCard.id, 4)}>
                            Good <span>(Standard)</span>
                          </button>
                          <button className="srs-btn srs-btn-6" onClick={() => onReviewFlashcard(currentCard.id, 5)}>
                            Easy <span>(Perfect)</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
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
