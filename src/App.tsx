import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { initializeAI, sendMessageToAI } from './ai-service';
import './App.css';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

function App() {
  const [apiKey, setApiKey] = useState('');
  const [isApiKeySet, setIsApiKeySet] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSetApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      try {
        initializeAI(apiKey.trim());
        setIsApiKeySet(true);
      } catch (error) {
        alert("Failed to initialize AI. Please check your API key.");
      }
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue.trim();
    setInputValue('');

    // First message sets the topic implicitly in this simple UI
    if (!topic && messages.length === 0) {
      setTopic(userText);
    }

    const newUserMessage: Message = { id: Date.now().toString(), role: 'user', content: userText };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    const aiMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: aiMessageId, role: 'ai', content: '' }]);

    try {
      await sendMessageToAI(userText, (chunk) => {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === aiMessageId ? { ...msg, content: chunk } : msg
          )
        );
      });
    } catch (error) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === aiMessageId ? { ...msg, content: "⚠️ *Error communicating with the AI. Please try again.*" } : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isApiKeySet) {
    return (
      <div className="app-container setup-container">
        <div className="setup-card">
          <div className="setup-header">
            <div className="setup-icon">🧠</div>
            <h1>AI Teacher</h1>
            <p>Welcome to your Socratic guide. Please enter your Gemini API key to begin building knowledge.</p>
          </div>
          <form className="setup-form" onSubmit={handleSetApiKey}>
            <input
              type="password"
              placeholder="Enter Gemini API Key (AIzaSy...)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary">
              Begin Journey
            </button>
          </form>
          <div className="setup-footer">
            Your key is used locally in your browser and is not sent to our servers.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar for Blueprint and Ladder of Mastery */}
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
                Follow the Master Craftsman's instructions. The blueprint will naturally evolve in the chat as you climb the Ladder of Mastery.
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

      {/* Main Chat Interface */}
      <main className="app-main">
        <header className="main-header">
          <h2>Master Craftsman</h2>
          <span className="status-indicator">{isLoading ? 'Typing...' : 'Ready'}</span>
        </header>

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
          <form className="input-form" onSubmit={handleSendMessage}>
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
