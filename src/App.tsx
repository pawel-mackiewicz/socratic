import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  fetchGeminiModels,
  getDefaultModel,
  initializeAI,
  sendMessageToAI,
  setActiveModel,
  type ChatMessage,
} from './ai-service';
import './App.css';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

const API_KEY_STORAGE_KEY = 'aiTeacher.geminiApiKey';
const MODEL_STORAGE_KEY = 'aiTeacher.geminiModel';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'Unexpected error. Please try again.';
};

function App() {
  const [apiKey, setApiKey] = useState('');
  const [isApiKeySet, setIsApiKeySet] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([getDefaultModel()]);
  const [selectedModel, setSelectedModel] = useState(getDefaultModel());
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [modelWarning, setModelWarning] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue.trim();
    const historyBeforeSend: ChatMessage[] = messages.map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));

    setInputValue('');

    if (!topic && messages.length === 0) {
      setTopic(userText);
    }

    const newUserMessage: Message = { id: Date.now().toString(), role: 'user', content: userText };
    const aiMessageId = (Date.now() + 1).toString();

    setMessages((prev) => [...prev, newUserMessage, { id: aiMessageId, role: 'ai', content: '' }]);
    setIsLoading(true);

    try {
      await sendMessageToAI(userText, historyBeforeSend, (chunk) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId ? { ...msg, content: chunk } : msg,
          ),
        );
      });
    } catch {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId ? { ...msg, content: '⚠️ *Error communicating with Gemini. Please try again.*' } : msg,
        ),
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
        <div className="sidebar-header">
          <h2>Learning Blueprint</h2>
        </div>
        <div className="sidebar-content">
          {!topic ? (
            <div className="blueprint-placeholder">
              <p>The Blueprint will begin assembling once you provide a topic to the Master Craftsman.</p>
            </div>
          ) : (
            <div className="blueprint-active">
              <h3 style={{ color: 'var(--accent-primary)', marginBottom: '1rem', fontSize: '1.2rem', fontFamily: 'var(--font-display)' }}>
                Topic: {topic}
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Follow the Master Craftsman&apos;s instructions. The blueprint will naturally evolve in the chat as you climb the Ladder of Mastery.
              </p>
              <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--accent-success)' }}>
                  <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Level 2: Understand</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Rephrase & Analogy</span>
                </div>
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', opacity: 0.6, borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--text-tertiary)' }}>
                  <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Level 3: Apply</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Practical Problem</span>
                </div>
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', opacity: 0.6, borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--text-tertiary)' }}>
                  <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Level 4: Analyze</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Dissect Complex Scenarios</span>
                </div>
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', opacity: 0.6, borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--text-tertiary)' }}>
                  <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Level 5: Evaluate</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Critique Proposals</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="app-main">
        <header className="main-header">
          <h2>Master Craftsman</h2>
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
      </main>
    </div>
  );
}

export default App;
