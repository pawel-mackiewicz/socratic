import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Message } from '../types/app';

interface ChatMessageItemProps {
    message: Message;
    isGenerating: boolean;
    isLoading: boolean;
    onRetryMessage: (messageId: string) => void;
    onEditMessage: (messageId: string, newContent: string) => void;
}

export function ChatMessageItem({
    message,
    isGenerating,
    isLoading,
    onRetryMessage,
    onEditMessage,
}: ChatMessageItemProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(message.content);

    const isAiError =
        message.role === 'ai' && message.content.includes('Use **Retry from here** on your message to try again.');

    const handleEditStart = () => {
        setIsEditing(true);
        setEditContent(message.content);
    };

    const handleEditCancel = () => {
        setIsEditing(false);
    };

    const handleEditSave = () => {
        onEditMessage(message.id, editContent);
        setIsEditing(false);
    };

    return (
        <div className={`message ${message.role === 'user' ? 'user-message' : 'ai-message'} ${isAiError ? 'ai-message-error' : ''}`}>
            <div className={`message-avatar ${isGenerating ? 'animate-pulse' : ''}`}>{message.role === 'user' ? 'U' : '🧠'}</div>
            <div className="message-content prose">
                {message.role === 'ai' ? (
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                ) : isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            style={{
                                width: '100%',
                                minHeight: '60px',
                                padding: '8px',
                                borderRadius: '4px',
                                backgroundColor: 'transparent',
                                border: '1px solid currentColor',
                                opacity: 0.8,
                                color: 'inherit',
                            }}
                            disabled={isLoading}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '0.7rem', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                className="message-retry-btn"
                                style={{ margin: 0 }}
                                onClick={handleEditSave}
                                disabled={!editContent.trim() || isLoading}
                            >
                                Save
                            </button>
                            <button
                                type="button"
                                className="message-retry-btn"
                                style={{ margin: 0 }}
                                onClick={handleEditCancel}
                                disabled={isLoading}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '0.7rem', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                className="message-retry-btn"
                                style={{ margin: 0 }}
                                onClick={() => onRetryMessage(message.id)}
                                disabled={isLoading}
                                aria-label="Retry from this message"
                                title="Retry from this message"
                            >
                                Retry from here
                            </button>
                            <button
                                type="button"
                                className="message-retry-btn"
                                style={{ margin: 0 }}
                                onClick={handleEditStart}
                                disabled={isLoading}
                                aria-label="Edit this message"
                                title="Edit this message"
                            >
                                Edit
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
