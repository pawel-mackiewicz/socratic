import type { FormEvent } from 'react';
import { useState, useRef, useEffect } from 'react';
import type { UseWordsResult, WordReviewRating } from '../hooks/useWords';
import './WordsPanel.css';

interface WordsPanelProps {
    words: UseWordsResult;
    viewMode: 'review' | 'manage';
}

export function WordsPanel({ words, viewMode }: WordsPanelProps) {
    const [manualWordInput, setManualWordInput] = useState('');
    const [topicInput, setTopicInput] = useState('');
    const [topicCount, setTopicCount] = useState(10);
    const [isRevealed, setIsRevealed] = useState(false);

    const handleManualEnrich = async (e: FormEvent) => {
        e.preventDefault();
        if (!manualWordInput.trim()) return;
        await words.enrichWord(manualWordInput);
    };

    const handleGenerateTopic = async (e: FormEvent) => {
        e.preventDefault();
        if (!topicInput.trim()) return;
        await words.generateTopicDrafts(topicInput, topicCount);
    };

    const handleReviewRating = (rating: WordReviewRating) => {
        if (!words.currentCard) return;
        words.reviewWordCard(words.currentCard.id, rating);
        setIsRevealed(false);
    };

    const validTopicDraftsCount = words.topicDrafts.filter(
        (d) => !d.isDuplicate && !d.isIncomplete
    ).length;

    const draftsListRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!words.isGeneratingTopicWords && words.topicDrafts.length > 0 && draftsListRef.current) {
            draftsListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [words.isGeneratingTopicWords, words.topicDrafts.length]);

    return (
        <div className="words-panel">
            <div className="words-panel-content">
                {/* 1. Settings Section */}
                {viewMode === 'manage' && (
                    <>
                        <section className="words-section">
                            <h3>Settings</h3>
                            <div className="settings-grid">
                                <div className="form-group">
                                    <label htmlFor="target-lang">Target Language</label>
                                    <input
                                        id="target-lang"
                                        type="text"
                                        placeholder="e.g. Spanish"
                                        value={words.settings.targetLanguage}
                                        onChange={(e) => words.setTargetLanguage(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="native-lang">Native Language</label>
                                    <input
                                        id="native-lang"
                                        type="text"
                                        placeholder="e.g. English"
                                        value={words.settings.nativeLanguage}
                                        onChange={(e) => words.setNativeLanguage(e.target.value)}
                                    />
                                </div>
                            </div>
                        </section>

                        {/* 2. Manual Add Section */}
                        <section className="words-section">
                            <h3>Add Word</h3>
                            <form onSubmit={handleManualEnrich} className="form-group">
                                <label htmlFor="manual-word">Enrich word with AI</label>
                                <div className="input-with-button">
                                    <input
                                        id="manual-word"
                                        type="text"
                                        placeholder="Enter a new word..."
                                        value={manualWordInput}
                                        onChange={(e) => setManualWordInput(e.target.value)}
                                        disabled={words.isEnrichingWord}
                                    />
                                    <button
                                        type="submit"
                                        className="btn-primary"
                                        disabled={words.isEnrichingWord || !manualWordInput.trim()}
                                    >
                                        {words.isEnrichingWord ? 'Enriching...' : 'Enrich with AI'}
                                    </button>
                                </div>
                            </form>

                            {words.manualError && (
                                <div className="error-message">{words.manualError}</div>
                            )}

                            {words.manualDraft && (
                                <div
                                    className={`draft-card ${words.manualDraft.isDuplicate ? 'duplicate' : ''} ${words.manualDraft.isIncomplete ? 'incomplete' : ''}`}
                                >
                                    {words.manualDraft.isDuplicate && (
                                        <div className="draft-warning">⚠️ This word already exists in your deck.</div>
                                    )}
                                    {words.manualDraft.isIncomplete && (
                                        <div className="draft-error">❌ Missing required fields.</div>
                                    )}

                                    <div className="draft-fields">
                                        <div className="form-group">
                                            <label>Word</label>
                                            <input
                                                value={words.manualDraft.word}
                                                onChange={(e) => words.updateManualDraft('word', e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Translation</label>
                                            <input
                                                value={words.manualDraft.translation}
                                                onChange={(e) => words.updateManualDraft('translation', e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Definition</label>
                                            <input
                                                value={words.manualDraft.definition}
                                                onChange={(e) => words.updateManualDraft('definition', e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Example</label>
                                            <input
                                                value={words.manualDraft.example}
                                                onChange={(e) => words.updateManualDraft('example', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="draft-actions">
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={words.discardManualDraft}
                                        >
                                            Discard
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            onClick={words.saveManualDraft}
                                            disabled={words.manualDraft.isDuplicate || words.manualDraft.isIncomplete}
                                        >
                                            Save Word
                                        </button>
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* 3. Topic Generator Section */}
                        <section className="words-section">
                            <h3>Topic Generator</h3>
                            <form onSubmit={handleGenerateTopic} className="form-group">
                                <label htmlFor="topic-input">Generate words with AI from a topic</label>
                                <div className="input-with-button">
                                    <input
                                        id="topic-input"
                                        type="text"
                                        placeholder="e.g. At the restaurant"
                                        value={topicInput}
                                        onChange={(e) => setTopicInput(e.target.value)}
                                        disabled={words.isGeneratingTopicWords}
                                        style={{ flex: 2 }}
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={topicCount}
                                        onChange={(e) => setTopicCount(Number(e.target.value))}
                                        disabled={words.isGeneratingTopicWords}
                                        style={{ width: '80px', flex: 'none' }}
                                    />
                                    <button
                                        type="submit"
                                        className="btn-primary"
                                        disabled={words.isGeneratingTopicWords || !topicInput.trim()}
                                    >
                                        {words.isGeneratingTopicWords ? 'Generating...' : 'Generate with AI'}
                                    </button>
                                </div>
                            </form>

                            {words.topicError && (
                                <div className="error-message">{words.topicError}</div>
                            )}

                            {words.topicDrafts.length > 0 && (
                                <div className="topic-drafts-list" ref={draftsListRef}>
                                    <h4>Generated Words ({words.topicDrafts.length})</h4>
                                    {words.topicDrafts.map((draft) => (
                                        <div
                                            key={draft.id}
                                            className={`draft-card ${draft.isDuplicate ? 'duplicate' : ''} ${draft.isIncomplete ? 'incomplete' : ''}`}
                                        >
                                            <div className="topic-draft-header">
                                                {draft.isDuplicate && (
                                                    <span className="draft-warning" style={{ margin: 0 }}>⚠️ Duplicate</span>
                                                )}
                                                {draft.isIncomplete && (
                                                    <span className="draft-error" style={{ margin: 0 }}>❌ Incomplete</span>
                                                )}
                                                <button
                                                    type="button"
                                                    className="btn-icon"
                                                    onClick={() => words.removeTopicDraft(draft.id)}
                                                    title="Remove word"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            <div className="settings-grid">
                                                <div className="form-group">
                                                    <label>Word</label>
                                                    <input
                                                        value={draft.word}
                                                        onChange={(e) => words.updateTopicDraft(draft.id, 'word', e.target.value)}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Translation</label>
                                                    <input
                                                        value={draft.translation}
                                                        onChange={(e) => words.updateTopicDraft(draft.id, 'translation', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="settings-grid" style={{ marginTop: '12px' }}>
                                                <div className="form-group">
                                                    <label>Definition</label>
                                                    <input
                                                        value={draft.definition}
                                                        onChange={(e) => words.updateTopicDraft(draft.id, 'definition', e.target.value)}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Example</label>
                                                    <input
                                                        value={draft.example}
                                                        onChange={(e) => words.updateTopicDraft(draft.id, 'example', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    <div className="topic-actions">
                                        <button
                                            type="button"
                                            className="btn-secondary btn-danger"
                                            onClick={words.clearTopicDrafts}
                                        >
                                            Clear All
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            onClick={() => {
                                                words.saveTopicDrafts();
                                                setTopicInput('');
                                            }}
                                            disabled={validTopicDraftsCount === 0}
                                        >
                                            Save {validTopicDraftsCount} Valid Words
                                        </button>
                                    </div>
                                </div>
                            )}
                        </section>
                    </>
                )}

                {/* 4. Review Section */}
                {viewMode === 'review' && (
                    <section className="words-section">
                        <h3>Review ({words.dueCardsCount} due)</h3>
                        {!words.currentCard || !words.currentNote ? (
                            <div className="no-cards">
                                <p>You're all caught up! No words to review right now.</p>
                            </div>
                        ) : (
                            <div className="review-card-container">
                                <div className="review-card">
                                    {words.currentNote.topic && (
                                        <div className="review-topic">{words.currentNote.topic}</div>
                                    )}
                                    <h2 className="review-word">{words.currentNote.word}</h2>

                                    {!isRevealed ? (
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            onClick={() => setIsRevealed(true)}
                                            style={{ marginTop: '24px' }}
                                        >
                                            Reveal Answer
                                        </button>
                                    ) : (
                                        <div className="review-answer">
                                            <p className="review-translation">{words.currentNote.translation}</p>
                                            <p className="review-definition">{words.currentNote.definition}</p>
                                            <p className="review-example">"{words.currentNote.example}"</p>

                                            <div style={{ marginTop: '24px' }}>
                                                <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                                    How well did you know this?
                                                </p>
                                                <div className="rating-buttons">
                                                    {[0, 1, 2, 3, 4, 5].map((rating) => (
                                                        <button
                                                            key={rating}
                                                            className={`btn-rating rating-${rating}`}
                                                            onClick={() => handleReviewRating(rating as WordReviewRating)}
                                                        >
                                                            <span className="rating-score">{rating}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}
