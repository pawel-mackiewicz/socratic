import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  fetchGeminiModels,
  getDefaultModel,
  initializeAI,
  sendMessageToAI,
  setActiveModel,
  generateFlashcards,
  type ChatMessage,
} from './ai-service';
import { calculateNextSRSDelay, type SRSData } from './srs';
import './App.css';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  topic: string | null;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  topic: string;
  conversationId: string;
  interval: number;
  repetition: number;
  easinessFactor: number;
  nextReviewDate: number;
}

const API_KEY_STORAGE_KEY = 'aiTeacher.geminiApiKey';
const MODEL_STORAGE_KEY = 'aiTeacher.geminiModel';
const CONVERSATIONS_STORAGE_KEY = 'aiTeacher.conversations';
const ACTIVE_CONVERSATION_STORAGE_KEY = 'aiTeacher.activeConversationId';
const FLASHCARDS_STORAGE_KEY = 'aiTeacher.flashcards';
const DEFAULT_CONVERSATION_TITLE = 'New conversation';
const MAX_CONVERSATION_TITLE_LENGTH = 52;
const EMPTY_MESSAGES: Message[] = [];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'Unexpected error. Please try again.';
};

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toConversationTitle = (value: string): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return DEFAULT_CONVERSATION_TITLE;
  if (normalized.length <= MAX_CONVERSATION_TITLE_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 3)}...`;
};

const toMessagePreview = (messages: Message[]): string => {
  const lastWithContent = [...messages].reverse().find((entry) => entry.content.trim().length > 0);
  if (!lastWithContent) return 'No messages yet';

  const normalized = lastWithContent.content.trim().replace(/\s+/g, ' ');
  if (normalized.length <= 72) return normalized;
  return `${normalized.slice(0, 69)}...`;
};

const formatConversationTimestamp = (value: number): string => {
  const date = new Date(value);
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const normalizeMessages = (value: unknown): Message[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (entry): entry is { id?: unknown; role?: unknown; content?: unknown } =>
        typeof entry === 'object' && entry !== null,
    )
    .map((entry) => ({
      id: typeof entry.id === 'string' && entry.id ? entry.id : createId(),
      role: entry.role === 'user' ? 'user' : 'ai',
      content: typeof entry.content === 'string' ? entry.content : '',
    }));
};

const createConversation = (): Conversation => {
  const now = Date.now();
  return {
    id: createId(),
    title: DEFAULT_CONVERSATION_TITLE,
    topic: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
};

const loadStoredConversations = (): Conversation[] => {
  const raw = localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
  if (!raw) return [createConversation()];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [createConversation()];

    const normalized = parsed
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map((entry) => {
        const messages = normalizeMessages(entry.messages);
        const fallbackTitle = messages.find((msg) => msg.role === 'user')?.content || '';
        const createdAt = Number.isFinite(entry.createdAt) ? Number(entry.createdAt) : Date.now();
        const updatedAt = Number.isFinite(entry.updatedAt) ? Number(entry.updatedAt) : createdAt;

        return {
          id: typeof entry.id === 'string' && entry.id ? entry.id : createId(),
          title:
            typeof entry.title === 'string' && entry.title.trim()
              ? toConversationTitle(entry.title)
              : toConversationTitle(fallbackTitle),
          topic: typeof entry.topic === 'string' && entry.topic.trim() ? entry.topic : null,
          messages,
          createdAt,
          updatedAt,
        };
      });

    return normalized.length > 0 ? normalized : [createConversation()];
  } catch {
    return [createConversation()];
  }
};

const loadStoredFlashcards = (): Flashcard[] => {
  const raw = localStorage.getItem(FLASHCARDS_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Flashcard[];
  } catch {
    return [];
  }
};

function App() {
  const [apiKey, setApiKey] = useState('');
  const [isApiKeySet, setIsApiKeySet] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([getDefaultModel()]);
  const [selectedModel, setSelectedModel] = useState(getDefaultModel());
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [modelWarning, setModelWarning] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [isFlashcardsView, setIsFlashcardsView] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [currentStudyCardId, setCurrentStudyCardId] = useState<string | null>(null);
  const [isCardRevealed, setIsCardRevealed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [conversations, activeConversationId],
  );
  const messages = useMemo(
    () => activeConversation?.messages || EMPTY_MESSAGES,
    [activeConversation],
  );

  const sortedConversations = useMemo(
    () => [...conversations].sort((left, right) => right.updatedAt - left.updatedAt),
    [conversations],
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const refreshModels = async (key: string, preferredModel: string | null) => {
    setIsModelLoading(true);
    const result = await fetchGeminiModels(key);
    setModelWarning(result.warning || null);
    setModelOptions(result.models);

    const preferred = preferredModel?.trim() || '';
    const effectiveModel = result.models.includes(preferred) ? preferred : result.models[0];

    setSelectedModel(effectiveModel);
    setActiveModel(effectiveModel);
    localStorage.setItem(MODEL_STORAGE_KEY, effectiveModel);
    setIsModelLoading(false);
  };

  useEffect(() => {
    const bootstrap = async () => {
      const storedConversations = loadStoredConversations();
      const storedActiveConversationId = localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
      const selectedConversationId =
        storedActiveConversationId &&
          storedConversations.some((conversation) => conversation.id === storedActiveConversationId)
          ? storedActiveConversationId
          : storedConversations[0].id;

      setConversations(storedConversations);
      setActiveConversationId(selectedConversationId);
      setFlashcards(loadStoredFlashcards());

      const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      const storedModel = localStorage.getItem(MODEL_STORAGE_KEY);

      if (!storedApiKey) {
        setIsBootstrapping(false);
        return;
      }

      setApiKey(storedApiKey);
      setSetupError(null);

      try {
        initializeAI(storedApiKey);
        await refreshModels(storedApiKey, storedModel);
        setIsApiKeySet(true);
      } catch (error) {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        localStorage.removeItem(MODEL_STORAGE_KEY);
        setIsApiKeySet(false);
        setSetupError(`Stored API key is invalid: ${getErrorMessage(error)}`);
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    if (conversations.length === 0) return;
    localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, activeConversationId);
  }, [activeConversationId]);

  useEffect(() => {
    localStorage.setItem(FLASHCARDS_STORAGE_KEY, JSON.stringify(flashcards));
  }, [flashcards]);

  const handleCreateConversation = () => {
    if (isLoading) return;

    const nextConversation = createConversation();
    setConversations((prev) => [nextConversation, ...prev]);
    setActiveConversationId(nextConversation.id);
    setInputValue('');
    setIsFlashcardsView(false);
  };

  const handleCreateFlashcards = async () => {
    if (!activeConversation || isGeneratingFlashcards) return;
    setIsGeneratingFlashcards(true);
    try {
      const topic = activeConversation.topic || activeConversation.title;
      const generated = await generateFlashcards(topic, activeConversation.messages);

      const newCards: Flashcard[] = generated.map(card => ({
        id: createId(),
        front: card.front,
        back: card.back,
        topic,
        conversationId: activeConversation.id,
        interval: 0,
        repetition: 0,
        easinessFactor: 2.5,
        nextReviewDate: Date.now(),
      }));

      setFlashcards(prev => [...prev, ...newCards]);
      setIsFlashcardsView(true);
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  const handleReviewFlashcard = (cardId: string, rating: 0 | 1 | 2 | 3 | 4 | 5) => {
    setFlashcards(prev => prev.map(card => {
      if (card.id !== cardId) return card;

      const currentData: SRSData = {
        interval: card.interval,
        repetition: card.repetition,
        easinessFactor: card.easinessFactor
      };

      const newData = calculateNextSRSDelay(rating, currentData);

      return {
        ...card,
        ...newData
      };
    }));

    setIsCardRevealed(false);
    setCurrentStudyCardId(null);
  };

  const handleSetApiKey = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedKey = apiKey.trim();
    if (!normalizedKey) return;

    setSetupError(null);
    setModelWarning(null);

    try {
      initializeAI(normalizedKey);
      await refreshModels(normalizedKey, localStorage.getItem(MODEL_STORAGE_KEY));
      localStorage.setItem(API_KEY_STORAGE_KEY, normalizedKey);
      setApiKey(normalizedKey);
      setIsApiKeySet(true);
    } catch (error) {
      setIsApiKeySet(false);
      setSetupError(getErrorMessage(error));
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    setSelectedModel(modelId);
    setActiveModel(modelId);
    localStorage.setItem(MODEL_STORAGE_KEY, modelId);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isLoading || !activeConversation) return;

    const userText = inputValue.trim();
    const currentConversationId = activeConversation.id;
    const historyBeforeSend: ChatMessage[] = activeConversation.messages.map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));

    setInputValue('');

    const newUserMessage: Message = { id: createId(), role: 'user', content: userText };
    const aiMessageId = createId();

    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== currentConversationId) return conversation;

        return {
          ...conversation,
          topic: conversation.topic || userText,
          title: conversation.messages.length === 0 ? toConversationTitle(userText) : conversation.title,
          messages: [...conversation.messages, newUserMessage, { id: aiMessageId, role: 'ai', content: '' }],
          updatedAt: Date.now(),
        };
      }),
    );

    setIsLoading(true);

    try {
      await sendMessageToAI(userText, historyBeforeSend, (chunk) => {
        setConversations((prev) =>
          prev.map((conversation) => {
            if (conversation.id !== currentConversationId) return conversation;

            return {
              ...conversation,
              messages: conversation.messages.map((msg) =>
                msg.id === aiMessageId ? { ...msg, content: chunk } : msg,
              ),
              updatedAt: Date.now(),
            };
          }),
        );
      });
    } catch {
      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== currentConversationId) return conversation;

          return {
            ...conversation,
            messages: conversation.messages.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, content: '⚠️ *Error communicating with Gemini. Please try again.*' }
                : msg,
            ),
            updatedAt: Date.now(),
          };
        }),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const dueCards = flashcards.filter(c => c.nextReviewDate <= Date.now());
  const currentCard = currentStudyCardId
    ? flashcards.find(c => c.id === currentStudyCardId) || dueCards[0] || null
    : dueCards[0] || null;

  useEffect(() => {
    if (currentCard && currentStudyCardId !== currentCard.id) {
      setCurrentStudyCardId(currentCard.id);
      setIsCardRevealed(false);
    }
  }, [currentCard, currentStudyCardId]);

  if (isBootstrapping) {
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

  if (!isApiKeySet) {
    return (
      <div className="app-container setup-container">
        <div className="setup-card">
          <div className="setup-header">
            <div className="setup-icon">🧠</div>
            <h1>AI Teacher</h1>
            <p>Welcome to your Socratic guide. Enter your Gemini API key to begin.</p>
          </div>
          <form className="setup-form" onSubmit={(e) => void handleSetApiKey(e)}>
            <input
              type="password"
              placeholder="Enter Gemini API Key (AIzaSy...)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary" disabled={isModelLoading}>
              {isModelLoading ? 'Connecting...' : 'Begin Journey'}
            </button>
          </form>
          {setupError ? <p className="setup-error">{setupError}</p> : null}
          <div className="setup-warning" role="alert">
            <strong>Security warning:</strong> API keys stored in browser storage are vulnerable to theft by malicious scripts or browser extensions.
            Use this mode only for personal/local use.
          </div>
          <div className="setup-footer">
            This app does not send your key to your own backend, but browser-side storage is not a secure vault.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <aside className="app-sidebar">
        <div className="sidebar-header sidebar-header-row">
          <h2>Menu</h2>
        </div>

        <button
          className={`sidebar-menu-btn ${isFlashcardsView ? 'active' : ''}`}
          onClick={() => setIsFlashcardsView(true)}
        >
          Flashcards ({dueCards.length} due)
        </button>

        <div className="sidebar-header sidebar-header-row" style={{ marginTop: '20px' }}>
          <h2>Conversations</h2>
          <button
            type="button"
            className="new-chat-btn"
            onClick={handleCreateConversation}
            disabled={isLoading}
          >
            New
          </button>
        </div>
        <div className="conversation-list" aria-label="Saved conversations">
          {sortedConversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`conversation-item ${conversation.id === activeConversationId && !isFlashcardsView ? 'active' : ''}`}
              onClick={() => {
                setActiveConversationId(conversation.id);
                setIsFlashcardsView(false);
              }}
              disabled={isLoading}
            >
              <span className="conversation-title">{conversation.title}</span>
              <span className="conversation-preview">{toMessagePreview(conversation.messages)}</span>
              <span className="conversation-meta">{formatConversationTimestamp(conversation.updatedAt)}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="app-main">
        <header className="main-header">
          <h2>{isFlashcardsView ? 'Flashcards Dashboard' : 'Master Craftsman'}</h2>
          {!isFlashcardsView && activeConversation?.messages.length ? (
            <button
              className="btn-secondary"
              onClick={handleCreateFlashcards}
              disabled={isGeneratingFlashcards}
              style={{ marginRight: '16px' }}
            >
              {isGeneratingFlashcards ? 'Generating...' : 'Make Flashcards'}
            </button>
          ) : null}
          <div className="header-controls">
            <label className="model-select-label" htmlFor="gemini-model-select">Model</label>
            <select
              id="gemini-model-select"
              className="model-select"
              value={selectedModel}
              onChange={handleModelChange}
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

        {modelWarning ? (
          <div className="model-warning-banner" role="status">
            {modelWarning}
          </div>
        ) : null}

        {isFlashcardsView ? (
          <div className="flashcards-area">
            {currentCard ? (
              <div className="flashcard-study-container">
                <div className="flashcard">
                  <div className="flashcard-front">
                    <h3>Question</h3>
                    <div className="prose"><ReactMarkdown>{currentCard.front}</ReactMarkdown></div>
                  </div>

                  {isCardRevealed ? (
                    <div className="flashcard-back">
                      <hr />
                      <h3>Answer</h3>
                      <div className="prose"><ReactMarkdown>{currentCard.back}</ReactMarkdown></div>

                      <div className="srs-controls">
                        <p>How well did you know this?</p>
                        <div className="srs-buttons">
                          <button className="srs-btn srs-btn-1" onClick={() => handleReviewFlashcard(currentCard.id, 0)}>Blackout <small>Reset</small></button>
                          <button className="srs-btn srs-btn-2" onClick={() => handleReviewFlashcard(currentCard.id, 1)}>Wrong <small>Remembered</small></button>
                          <button className="srs-btn srs-btn-3" onClick={() => handleReviewFlashcard(currentCard.id, 2)}>Wrong <small>Effortless</small></button>
                          <button className="srs-btn srs-btn-4" onClick={() => handleReviewFlashcard(currentCard.id, 3)}>Hard <small>Struggled</small></button>
                          <button className="srs-btn srs-btn-5" onClick={() => handleReviewFlashcard(currentCard.id, 4)}>Good <small>Standard</small></button>
                          <button className="srs-btn srs-btn-6" onClick={() => handleReviewFlashcard(currentCard.id, 5)}>Easy <small>Perfect</small></button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flashcard-reveal-container">
                      <button className="btn-primary" onClick={() => setIsCardRevealed(true)}>Reveal Answer</button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flashcards-empty">
                <div className="setup-icon">🎉</div>
                <h3>All caught up!</h3>
                <p>You have {flashcards.length} total flashcards, and 0 due right now.</p>
                <p>Review more conversations and generate more cards to accelerate your learning.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="chat-area">
              <div className="message ai-message">
                <div className="message-avatar">🧠</div>
                <div className="message-content prose">
                  <p>Greetings. I am your AI Teacher, here to help you construct a robust understanding of any topic, one solid brick at a time.</p>
                  <p>What topic would you like to master today? What do you already know about it, and what is your primary goal?</p>
                </div>
              </div>

              {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.role === 'user' ? 'user-message' : 'ai-message'}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? 'U' : '🧠'}
                  </div>
                  <div className="message-content prose">
                    {msg.role === 'ai' ? (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-area">
              <form className="input-form" onSubmit={(e) => void handleSendMessage(e)}>
                <textarea
                  placeholder="Type your message here... (Shift+Enter for newline)"
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                />
                <button type="submit" className="btn-send" aria-label="Send Message" disabled={!inputValue.trim() || isLoading}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
