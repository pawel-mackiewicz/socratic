export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

export interface Conversation {
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
