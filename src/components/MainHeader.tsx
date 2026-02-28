interface MainHeaderProps {
  isFlashcardsView: boolean;
  hasConversationMessages: boolean;
  isGeneratingFlashcards: boolean;
  onCreateFlashcards: () => void;
  modelOptions: string[];
  selectedModel: string;
  isLoading: boolean;
  isModelLoading: boolean;
  onModelChange: (modelId: string) => void;
}

export function MainHeader({
  isFlashcardsView,
  hasConversationMessages,
  isGeneratingFlashcards,
  onCreateFlashcards,
  modelOptions,
  selectedModel,
  isLoading,
  isModelLoading,
  onModelChange,
}: MainHeaderProps) {
  return (
    <header className="main-header">
      <h2>{isFlashcardsView ? 'Flashcards Dashboard' : 'Master Craftsman'}</h2>
      {!isFlashcardsView && hasConversationMessages ? (
        <button
          className="btn-secondary"
          onClick={onCreateFlashcards}
          disabled={isGeneratingFlashcards}
          style={{ marginRight: '16px' }}
        >
          {isGeneratingFlashcards ? 'Generating...' : 'Make Flashcards'}
        </button>
      ) : null}
      <div className="header-controls">
        <label className="model-select-label" htmlFor="gemini-model-select">
          Model
        </label>
        <select
          id="gemini-model-select"
          className="model-select"
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={isLoading || isModelLoading}
        >
          {modelOptions.map((modelId) => (
            <option key={modelId} value={modelId}>
              {modelId}
            </option>
          ))}
        </select>
        <span className="status-indicator">{isLoading ? 'Typing...' : 'Ready'}</span>
      </div>
    </header>
  );
}
