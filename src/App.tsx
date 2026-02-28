import type { FormEvent, MouseEvent } from 'react';
import { AppSidebar } from './components/AppSidebar';
import { ChatPanel } from './components/ChatPanel';
import { FlashcardsPanel } from './components/FlashcardsPanel';
import { MainHeader } from './components/MainHeader';
import { SetupScreen } from './components/SetupScreen';
import { useAiSetup } from './hooks/useAiSetup';
import { useChat } from './hooks/useChat';
import { useConversations } from './hooks/useConversations';
import { useFlashcards } from './hooks/useFlashcards';
import './App.css';
import { getErrorMessage } from './utils/error';

function App() {
  const aiSetup = useAiSetup();
  const conversations = useConversations();
  const flashcards = useFlashcards();
  const chat = useChat({
    activeConversation: conversations.activeConversation,
    setConversations: conversations.setConversations,
  });

  const handleSetApiKey = (e: FormEvent) => {
    e.preventDefault();
    void aiSetup.submitApiKey();
  };

  const handleCreateConversation = () => {
    if (chat.isLoading) return;

    conversations.createNewConversation();
    chat.setInputValue('');
    flashcards.setIsFlashcardsView(false);
  };

  const handleDeleteConversation = (e: MouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    if (chat.isLoading) return;

    if (!window.confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    conversations.deleteConversation(id);
  };

  const handleSelectConversation = (conversationId: string) => {
    if (chat.isLoading) return;

    conversations.selectConversation(conversationId);
    flashcards.setIsFlashcardsView(false);
  };

  const handleCreateFlashcards = async () => {
    try {
      await flashcards.generateForConversation(conversations.activeConversation);
    } catch (error) {
      alert(getErrorMessage(error));
    }
  };

  const handleChatSubmit = (e: FormEvent) => {
    void chat.sendMessage(e);
  };

  const handleRetryMessage = (messageId: string) => {
    void chat.retryMessage(messageId);
  };

  if (aiSetup.isBootstrapping) {
    return (
      <div className="app-container setup-container">
        <div className="setup-card">
          <div className="setup-header">
            <div className="setup-icon">🧠</div>
            <h1>AI Teacher</h1>
            <p>Loading your local Gemini settings...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!aiSetup.isApiKeySet) {
    return (
      <SetupScreen
        apiKey={aiSetup.apiKey}
        onApiKeyChange={aiSetup.setApiKey}
        onSubmit={handleSetApiKey}
        isModelLoading={aiSetup.isModelLoading}
        setupError={aiSetup.setupError}
      />
    );
  }

  return (
    <div className="app-container">
      <AppSidebar
        isFlashcardsView={flashcards.isFlashcardsView}
        dueCardsCount={flashcards.dueCardsCount}
        sortedConversations={conversations.sortedConversations}
        activeConversationId={conversations.activeConversationId}
        isLoading={chat.isLoading}
        onOpenFlashcards={() => flashcards.setIsFlashcardsView(true)}
        onCreateConversation={handleCreateConversation}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      <main className="app-main">
        <MainHeader
          isFlashcardsView={flashcards.isFlashcardsView}
          hasConversationMessages={Boolean(conversations.activeConversation?.messages.length)}
          isGeneratingFlashcards={flashcards.isGeneratingFlashcards}
          onCreateFlashcards={handleCreateFlashcards}
          modelOptions={aiSetup.modelOptions}
          selectedModel={aiSetup.selectedModel}
          isLoading={chat.isLoading}
          isModelLoading={aiSetup.isModelLoading}
          onModelChange={aiSetup.changeModel}
        />

        {aiSetup.modelWarning ? (
          <div className="model-warning-banner" role="status">
            {aiSetup.modelWarning}
          </div>
        ) : null}

        {flashcards.isFlashcardsView ? (
          <FlashcardsPanel
            currentCard={flashcards.currentCard}
            flashcardsCount={flashcards.flashcards.length}
            isCardRevealed={flashcards.isCardRevealed}
            onRevealAnswer={flashcards.revealCard}
            onReviewFlashcard={flashcards.reviewFlashcard}
          />
        ) : (
          <ChatPanel
            messages={conversations.messages}
            inputValue={chat.inputValue}
            isLoading={chat.isLoading}
            onInputChange={chat.setInputValue}
            onInputKeyDown={chat.handleInputEnter}
            onSubmit={handleChatSubmit}
            onRetryMessage={handleRetryMessage}
          />
        )}
      </main>
    </div>
  );
}

export default App;
