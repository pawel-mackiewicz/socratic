import type { KeyboardEvent, MouseEvent } from 'react';
import {
  formatConversationTimestamp,
  toMessagePreview,
} from '../domain/conversations';
import { SystemLogsButton } from '../LogsViewer';
import type { Conversation } from '../types/app';

interface AppSidebarProps {
  isFlashcardsView: boolean;
  dueCardsCount: number;
  sortedConversations: Conversation[];
  activeConversationId: string;
  isLoading: boolean;
  onOpenFlashcards: () => void;
  onCreateConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation: (e: MouseEvent<HTMLButtonElement>, conversationId: string) => void;
}

export function AppSidebar({
  isFlashcardsView,
  dueCardsCount,
  sortedConversations,
  activeConversationId,
  isLoading,
  onOpenFlashcards,
  onCreateConversation,
  onSelectConversation,
  onDeleteConversation,
}: AppSidebarProps) {
  const handleConversationKeyDown = (
    e: KeyboardEvent<HTMLDivElement>,
    conversationId: string,
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isLoading) return;
      onSelectConversation(conversationId);
    }
  };

  return (
    <aside className="app-sidebar">
      <div className="sidebar-header sidebar-header-row">
        <h2>Menu</h2>
      </div>

      <button
        className={`sidebar-menu-btn ${isFlashcardsView ? 'active' : ''}`}
        onClick={onOpenFlashcards}
      >
        Flashcards ({dueCardsCount} due)
      </button>

      <SystemLogsButton />

      <div className="sidebar-header sidebar-header-row" style={{ marginTop: '20px' }}>
        <h2>Conversations</h2>
        <button
          type="button"
          className="new-chat-btn"
          onClick={onCreateConversation}
          disabled={isLoading}
        >
          New
        </button>
      </div>
      <div className="conversation-list" aria-label="Saved conversations">
        {sortedConversations.map((conversation) => (
          <div
            key={conversation.id}
            className={`conversation-item ${conversation.id === activeConversationId && !isFlashcardsView ? 'active' : ''}`}
            onClick={() => {
              if (isLoading) return;
              onSelectConversation(conversation.id);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => handleConversationKeyDown(e, conversation.id)}
            style={{ cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.65 : 1 }}
          >
            <div className="conversation-content">
              <span className="conversation-title">{conversation.title}</span>
              <span className="conversation-meta">{formatConversationTimestamp(conversation.updatedAt)}</span>
              <span className="conversation-preview">{toMessagePreview(conversation.messages)}</span>
            </div>
            <button
              type="button"
              className="conversation-delete-btn"
              onClick={(e) => onDeleteConversation(e, conversation.id)}
              disabled={isLoading}
              aria-label="Delete conversation"
              title="Delete conversation"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18"></path>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
