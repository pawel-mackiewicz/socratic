import { SYSTEM_PROMPT } from './prompt';
import { addLog } from './logger';

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

export interface FetchModelsResult {
  models: string[];
  warning?: string;
  usedFallback: boolean;
}

export interface ChatRequestContext {
  conversationId?: string;
  aiMessageId?: string;
  trigger?: 'send' | 'retry';
}

export interface SendMessageToAIOptions {
  firstTokenTimeoutMs?: number;
  betweenChunksTimeoutMs?: number;
  requestContext?: ChatRequestContext;
}

export type FlashcardEvaluationScore = 0 | 1 | 2 | 3 | 4 | 5;

export interface FlashcardEvaluationResult {
  score: FlashcardEvaluationScore;
  argumentation: string;
  tips: string[];
}

export interface WordDescription {
  definition: string;
  example: string;
}

export interface WordEnrichment {
  word: string;
  translation: string;
  definition: string;
  example: string;
}

export interface TopicFlashcardGenerationOptions {
  history?: ChatMessage[];
  additionalInformation?: string;
}

type ChatRequestErrorCategory =
  | 'first_token_timeout'
  | 'between_tokens_timeout'
  | 'auth_error'
  | 'http_error'
  | 'network_error'
  | 'empty_response'
  | 'unknown';

const GEMINI_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_CHAT_STREAM_FIRST_TOKEN_TIMEOUT_SECONDS = 100;
const DEFAULT_CHAT_STREAM_BETWEEN_TOKENS_TIMEOUT_SECONDS = 25;

const readTimeoutSecondsFromEnv = (key: string, fallbackSeconds: number): number => {
  const env = import.meta.env as Record<string, string | undefined>;
  const rawValue = env[key];
  if (!rawValue) return fallbackSeconds;

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackSeconds;

  return Math.round(parsed);
};

const toMs = (seconds: number): number => seconds * 1000;

export const CHAT_STREAM_FIRST_TOKEN_TIMEOUT_MS = toMs(
  readTimeoutSecondsFromEnv(
    'VITE_CHAT_STREAM_FIRST_TOKEN_TIMEOUT_SECONDS',
    DEFAULT_CHAT_STREAM_FIRST_TOKEN_TIMEOUT_SECONDS,
  ),
);
export const CHAT_STREAM_BETWEEN_TOKENS_TIMEOUT_MS = toMs(
  readTimeoutSecondsFromEnv(
    'VITE_CHAT_STREAM_BETWEEN_TOKENS_TIMEOUT_SECONDS',
    DEFAULT_CHAT_STREAM_BETWEEN_TOKENS_TIMEOUT_SECONDS,
  ),
);

let activeApiKey: string | null = null;
let activeModelId = DEFAULT_GEMINI_MODEL;

const normalizeModelName = (name: string): string => name.replace(/^models\//, '');

const isModelExperimental = (modelId: string): boolean => {
  const value = modelId.toLowerCase();
  return value.includes('experimental') || value.includes('-exp');
};

const supportsTextGeneration = (methods: unknown): boolean => {
  if (!Array.isArray(methods)) return false;
  return methods.includes('generateContent') || methods.includes('streamGenerateContent');
};

const uniqueSorted = (values: string[]): string[] => {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
};

const parseChunkText = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return '';

  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return '';

  const firstCandidate = candidates[0] as { content?: { parts?: Array<{ text?: unknown }> } };
  const parts = firstCandidate.content?.parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('');
};

const parseFlashcardEvaluationResult = (text: string): FlashcardEvaluationResult => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Failed to parse flashcard evaluation JSON from AI response.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Flashcard evaluation JSON schema is invalid.');
  }

  const payload = parsed as {
    score?: unknown;
    argumentation?: unknown;
    tips?: unknown;
  };

  if (!Number.isInteger(payload.score)) {
    throw new Error('Flashcard evaluation score must be an integer between 0 and 5.');
  }

  const normalizedScore = Math.max(0, Math.min(5, Number(payload.score))) as FlashcardEvaluationScore;

  if (typeof payload.argumentation !== 'string' || payload.argumentation.trim().length === 0) {
    throw new Error('Flashcard evaluation argumentation must be a non-empty string.');
  }

  if (!Array.isArray(payload.tips)) {
    throw new Error('Flashcard evaluation tips must be a non-empty array of strings.');
  }

  const normalizedTips = payload.tips
    .filter((tip): tip is string => typeof tip === 'string')
    .map((tip) => tip.trim())
    .filter((tip) => tip.length > 0);

  if (normalizedTips.length === 0) {
    throw new Error('Flashcard evaluation tips must include at least one tip.');
  }

  return {
    score: normalizedScore,
    argumentation: payload.argumentation.trim(),
    tips: normalizedTips,
  };
};

const normalizeWordLookupKey = (value: string): string => {
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
};

const parseTopicWordsResult = (text: string): string[] => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Failed to parse generated topic words JSON from AI response.');
  }

  const rawWords = Array.isArray(parsed)
    ? parsed
    : (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { words?: unknown }).words)
    )
      ? (parsed as { words: unknown[] }).words
      : null;

  if (!rawWords) {
    throw new Error('Topic words JSON schema is invalid.');
  }

  const seen = new Set<string>();
  const words: string[] = [];

  rawWords.forEach((entry) => {
    if (typeof entry !== 'string') return;
    const normalized = entry.trim().replace(/\s+/g, ' ');
    const key = normalizeWordLookupKey(normalized);
    if (!normalized || !key || seen.has(key)) return;
    seen.add(key);
    words.push(normalized);
  });

  if (words.length === 0) {
    throw new Error('Topic words response did not include any valid words.');
  }

  return words;
};

const parseTopicFlashcardsResult = (text: string): Array<{ front: string; back: string }> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Failed to parse generated topic flashcards JSON from AI response.');
  }

  const rawFlashcards = (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { flashcards?: unknown }).flashcards)
  )
    ? (parsed as { flashcards: unknown[] }).flashcards
    : null;

  if (!rawFlashcards) {
    throw new Error('Topic flashcards JSON schema is invalid.');
  }

  const seen = new Set<string>();
  const flashcards: Array<{ front: string; back: string }> = [];

  rawFlashcards.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const payload = entry as { front?: unknown; back?: unknown };
    if (typeof payload.front !== 'string' || typeof payload.back !== 'string') return;

    const front = payload.front.trim().replace(/\s+/g, ' ');
    const back = payload.back.trim().replace(/\s+/g, ' ');
    if (!front || !back) return;

    const frontKey = normalizeWordLookupKey(front);
    if (!frontKey || seen.has(frontKey)) return;

    seen.add(frontKey);
    flashcards.push({ front, back });
  });

  if (flashcards.length === 0) {
    throw new Error('Topic flashcards response did not include any valid flashcards.');
  }

  return flashcards;
};

const parseWordTranslationsResult = (text: string): Record<string, string> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Failed to parse word translations JSON from AI response.');
  }

  const normalized: Record<string, string> = {};
  const consumePair = (word: unknown, translation: unknown) => {
    if (typeof word !== 'string' || typeof translation !== 'string') return;
    const key = normalizeWordLookupKey(word);
    const normalizedTranslation = translation.trim();
    if (!key || !normalizedTranslation) return;
    normalized[key] = normalizedTranslation;
  };

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { translations?: unknown }).translations)) {
    ((parsed as { translations: unknown[] }).translations).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const payload = entry as { word?: unknown; translation?: unknown };
      consumePair(payload.word, payload.translation);
    });
  } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    Object.entries(parsed).forEach(([word, value]) => {
      consumePair(word, value);
    });
  } else {
    throw new Error('Word translations JSON schema is invalid.');
  }

  if (Object.keys(normalized).length === 0) {
    throw new Error('Word translations response did not include valid entries.');
  }

  return normalized;
};

const parseWordDescriptionsResult = (text: string): Record<string, WordDescription> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Failed to parse word descriptions JSON from AI response.');
  }

  const normalized: Record<string, WordDescription> = {};
  const consumeEntry = (word: unknown, description: unknown, example?: unknown) => {
    if (typeof word !== 'string') return;
    const key = normalizeWordLookupKey(word);
    if (!key) return;

    let definitionValue = '';
    let exampleValue = '';

    if (typeof description === 'string' && typeof example === 'string') {
      definitionValue = description.trim();
      exampleValue = example.trim();
    } else if (description && typeof description === 'object') {
      const payload = description as { definition?: unknown; example?: unknown };
      if (typeof payload.definition === 'string') definitionValue = payload.definition.trim();
      if (typeof payload.example === 'string') exampleValue = payload.example.trim();
    }

    if (!definitionValue || !exampleValue) return;
    normalized[key] = {
      definition: definitionValue,
      example: exampleValue,
    };
  };

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { descriptions?: unknown }).descriptions)) {
    ((parsed as { descriptions: unknown[] }).descriptions).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const payload = entry as {
        word?: unknown;
        definition?: unknown;
        example?: unknown;
      };
      consumeEntry(payload.word, payload.definition, payload.example);
    });
  } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    Object.entries(parsed).forEach(([word, value]) => {
      consumeEntry(word, value);
    });
  } else {
    throw new Error('Word descriptions JSON schema is invalid.');
  }

  if (Object.keys(normalized).length === 0) {
    throw new Error('Word descriptions response did not include valid entries.');
  }

  return normalized;
};

const toGeminiRole = (role: ChatMessage['role']): 'user' | 'model' => {
  return role === 'ai' ? 'model' : 'user';
};

const createRequestContents = (history: ChatMessage[], message: string) => {
  const normalizedHistory = history
    .filter((entry) => entry.content.trim().length > 0)
    .map((entry) => ({
      role: toGeminiRole(entry.role),
      parts: [{ text: entry.content }],
    }));

  normalizedHistory.push({
    role: 'user',
    parts: [{ text: message }],
  });

  return normalizedHistory;
};

const processSseResponse = async (response: Response, onChunk: (text: string) => void): Promise<string> => {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('text/event-stream')) {
    const payload = await response.json();
    const text = parseChunkText(payload);
    onChunk(text);
    return text;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Gemini response stream is unavailable.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(':')) continue;
      if (!line.startsWith('data:')) continue;

      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const payload = JSON.parse(data);
        const chunkText = parseChunkText(payload);
        if (chunkText) {
          fullText += chunkText;
          onChunk(fullText);
        }
      } catch {
        // Ignore malformed SSE chunks and continue processing stream.
      }
    }
  }

  return fullText;
};

class GeminiChatRequestError extends Error {
  category: ChatRequestErrorCategory;
  httpStatus?: number;

  constructor(message: string, category: ChatRequestErrorCategory, httpStatus?: number) {
    super(message);
    this.category = category;
    this.httpStatus = httpStatus;
    this.name = 'GeminiChatRequestError';
  }
}

const toTimeoutSeconds = (valueMs: number): number => Math.max(1, Math.round(valueMs / 1000));

const toAbortError = (
  category: 'first_token_timeout' | 'between_tokens_timeout',
  firstTokenTimeoutMs: number,
  betweenTokensTimeoutMs: number,
): GeminiChatRequestError => {
  if (category === 'first_token_timeout') {
    return new GeminiChatRequestError(
      `Gemini did not send the first response token within ${toTimeoutSeconds(firstTokenTimeoutMs)} seconds. Use "Retry from here" to try again.`,
      category,
    );
  }

  return new GeminiChatRequestError(
    `Gemini stopped streaming for more than ${toTimeoutSeconds(betweenTokensTimeoutMs)} seconds. Use "Retry from here" to try again.`,
    category,
  );
};

const normalizeChatRequestError = (
  error: unknown,
  abortCategory: 'first_token_timeout' | 'between_tokens_timeout' | null,
  firstTokenTimeoutMs: number,
  betweenTokensTimeoutMs: number,
): GeminiChatRequestError => {
  if (error instanceof GeminiChatRequestError) return error;

  if (error instanceof DOMException && error.name === 'AbortError') {
    if (abortCategory) return toAbortError(abortCategory, firstTokenTimeoutMs, betweenTokensTimeoutMs);
    return new GeminiChatRequestError(
      'Gemini request was interrupted. Use "Retry from here" to try again.',
      'network_error',
    );
  }

  if (error instanceof TypeError) {
    return new GeminiChatRequestError(
      'Network error while contacting Gemini. Check your connection and retry.',
      'network_error',
    );
  }

  if (error instanceof Error) {
    return new GeminiChatRequestError(error.message || 'Gemini request failed.', 'unknown');
  }

  return new GeminiChatRequestError('Gemini request failed unexpectedly.', 'unknown');
};

export const initializeAI = (apiKey: string): void => {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) {
    throw new Error('Gemini API key is required.');
  }

  activeApiKey = normalizedKey;
};

export const setActiveModel = (modelId: string): void => {
  const normalizedModelId = modelId.trim();
  activeModelId = normalizedModelId || DEFAULT_GEMINI_MODEL;
};

export const getDefaultModel = (): string => DEFAULT_GEMINI_MODEL;

export const fetchGeminiModels = async (apiKey: string): Promise<FetchModelsResult> => {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) {
    throw new Error('Gemini API key is required.');
  }

  try {
    const response = await fetch(`${GEMINI_MODELS_ENDPOINT}?key=${encodeURIComponent(normalizedKey)}`);

    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid Gemini API key.');
    }

    if (!response.ok) {
      return {
        models: [DEFAULT_GEMINI_MODEL],
        usedFallback: true,
        warning: `Could not fetch model list (HTTP ${response.status}). Using fallback model ${DEFAULT_GEMINI_MODEL}.`,
      };
    }

    const payload = await response.json() as {
      models?: Array<{ name?: string; supportedGenerationMethods?: unknown }>;
    };

    const models = uniqueSorted(
      (payload.models || [])
        .filter((entry) => Boolean(entry.name))
        .filter((entry) => supportsTextGeneration(entry.supportedGenerationMethods))
        .map((entry) => normalizeModelName(entry.name as string))
        .filter((modelId) => modelId.startsWith('gemini'))
        .filter((modelId) => !isModelExperimental(modelId)),
    );

    if (models.length === 0) {
      return {
        models: [DEFAULT_GEMINI_MODEL],
        usedFallback: true,
        warning: `Gemini model list was empty. Using fallback model ${DEFAULT_GEMINI_MODEL}.`,
      };
    }

    return {
      models,
      usedFallback: false,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid Gemini API key.') {
      throw error;
    }

    return {
      models: [DEFAULT_GEMINI_MODEL],
      usedFallback: true,
      warning: `Could not fetch model list. Using fallback model ${DEFAULT_GEMINI_MODEL}.`,
    };
  }
};

export const sendMessageToAI = async (
  message: string,
  history: ChatMessage[],
  onChunk: (text: string) => void,
  options: SendMessageToAIOptions = {},
): Promise<string> => {
  if (!activeApiKey) {
    throw new Error('AI not initialized.');
  }

  const firstTokenTimeoutMs = options.firstTokenTimeoutMs ?? CHAT_STREAM_FIRST_TOKEN_TIMEOUT_MS;
  const betweenChunksTimeoutMs = options.betweenChunksTimeoutMs ?? CHAT_STREAM_BETWEEN_TOKENS_TIMEOUT_MS;
  const requestStartedAt = Date.now();

  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: createRequestContents(history, message),
    generationConfig: {
      maxOutputTokens: 8192,
    },
  };

  addLog('llm_prompt', `Sending message to ${activeModelId}`, payload);

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModelId)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(activeApiKey)}`;

  const endpointForLogs = `models/${activeModelId}:streamGenerateContent`;
  const abortController = new AbortController();
  let streamTimer: ReturnType<typeof setTimeout> | undefined;
  let abortCategory: 'first_token_timeout' | 'between_tokens_timeout' | null = null;
  let hadPartialResponse = false;
  let firstTokenReceived = false;

  const scheduleStreamTimeout = (
    timeoutMs: number,
    nextCategory: 'first_token_timeout' | 'between_tokens_timeout',
  ) => {
    if (streamTimer) clearTimeout(streamTimer);
    streamTimer = setTimeout(() => {
      abortCategory = nextCategory;
      abortController.abort();
    }, timeoutMs);
  };

  const clearTimer = () => {
    if (streamTimer) clearTimeout(streamTimer);
  };

  scheduleStreamTimeout(firstTokenTimeoutMs, 'first_token_timeout');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new GeminiChatRequestError(
        'Gemini request was rejected. Check your API key and permissions.',
        'auth_error',
        response.status,
      );
    }

    if (!response.ok) {
      throw new GeminiChatRequestError(`Gemini request failed with status ${response.status}.`, 'http_error', response.status);
    }

    const fullText = await processSseResponse(response, (text) => {
      if (!firstTokenReceived) firstTokenReceived = true;
      scheduleStreamTimeout(betweenChunksTimeoutMs, 'between_tokens_timeout');
      if (text.trim().length > 0) hadPartialResponse = true;
      onChunk(text);
    });

    if (!fullText.trim()) {
      throw new GeminiChatRequestError(
        'Gemini returned an empty response. Use "Retry from here" to try again.',
        'empty_response',
      );
    }

    addLog('llm_response', `Received response from ${activeModelId}`, { text: fullText });
    return fullText;
  } catch (error) {
    const normalizedError = normalizeChatRequestError(
      error,
      abortCategory,
      firstTokenTimeoutMs,
      betweenChunksTimeoutMs,
    );
    const durationMs = Date.now() - requestStartedAt;

    addLog('error', `Gemini chat request failed (${normalizedError.category})`, {
      requestType: 'chat',
      modelId: activeModelId,
      endpoint: endpointForLogs,
      errorCategory: normalizedError.category,
      errorMessage: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      durationMs,
      hadPartialResponse,
      conversationId: options.requestContext?.conversationId,
      aiMessageId: options.requestContext?.aiMessageId,
      trigger: options.requestContext?.trigger,
    });

    throw normalizedError;
  } finally {
    clearTimer();
  }
};

export const evaluateFlashcardAnswer = async (
  question: string,
  referenceAnswer: string,
  userAnswer: string,
): Promise<FlashcardEvaluationResult> => {
  if (!activeApiKey) {
    throw new Error('AI not initialized.');
  }

  const prompt = `Evaluate the user's flashcard answer.

Question:
${question}

Reference answer:
${referenceAnswer}

User answer:
${userAnswer}

Score rubric:
- 0: Blank, totally incorrect, or irrelevant
- 1: Mostly incorrect with only tiny correct fragments
- 2: Partially correct but key concepts missing or wrong
- 3: Mostly correct but important gaps or inaccuracies remain
- 4: Correct with minor omissions or imprecision
- 5: Correct, complete, and precise

Respond with valid JSON only in this exact format:
{
  "score": 0,
  "argumentation": "Short explanation of what was right/wrong.",
  "tips": ["Actionable tip 1", "Actionable tip 2"]
}`;

  const payload = {
    systemInstruction: {
      parts: [{ text: 'You are an expert tutor. Output valid JSON ONLY.' }],
    },
    contents: createRequestContents([], prompt),
    generationConfig: {
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  };

  addLog('llm_prompt', `Evaluating flashcard answer using ${activeModelId}`, payload);

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModelId)}` +
    `:generateContent?key=${encodeURIComponent(activeApiKey)}`;
  const endpointForLogs = `models/${activeModelId}:generateContent`;
  const requestStartedAt = Date.now();
  let httpStatus: number | undefined;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    httpStatus = response.status;
    if (!response.ok) {
      throw new Error(`Gemini request failed with status ${response.status}.`);
    }

    const data = await response.json();
    const text = parseChunkText(data);

    if (!text) {
      throw new Error('Gemini returned an empty flashcard evaluation response.');
    }

    addLog('llm_response', `Received flashcard evaluation response from ${activeModelId}`, { text });
    return parseFlashcardEvaluationResult(text);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Gemini flashcard evaluation failed unexpectedly.';
    addLog('error', 'Gemini flashcard evaluation request failed', {
      requestType: 'flashcard_evaluation',
      modelId: activeModelId,
      endpoint: endpointForLogs,
      errorMessage,
      httpStatus,
      durationMs: Date.now() - requestStartedAt,
    });

    if (error instanceof Error) throw error;
    throw new Error('Gemini flashcard evaluation failed.');
  }
};

export const generateFlashcards = async (
  topic: string,
  history: ChatMessage[],
): Promise<Array<{ front: string; back: string }>> => {
  if (!activeApiKey) {
    throw new Error('AI not initialized.');
  }

  const prompt = `Based on the preceding Socratic conversation about "${topic}", generate exactly 10 high-quality flashcards to help the user review and memorize the key concepts discussed.
You MUST respond with valid JSON ONLY.

JSON Format:
{
  "flashcards": [
    {
      "front": "Question or concept to remember",
      "back": "Detailed answer or explanation"
    }
  ]
}`;

  const payload = {
    systemInstruction: {
      parts: [{ text: "You are an expert AI educator. Output valid JSON ONLY." }],
    },
    contents: createRequestContents(history, prompt),
    generationConfig: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  };

  addLog('llm_prompt', `Generating flashcards using ${activeModelId}`, payload);

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModelId)}` +
    `:generateContent?key=${encodeURIComponent(activeApiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}.`);
  }

  const data = await response.json();
  const text = parseChunkText(data);

  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  addLog('llm_response', `Received flashcards response from ${activeModelId}`, { text });

  try {
    const parsed = JSON.parse(text);
    if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
      return parsed.flashcards;
    }
    throw new Error('Invalid JSON schema returned.');
  } catch (err) {
    console.error("Failed to parse flashcards:", text, err);
    throw new Error('Failed to parse flashcards from AI response.');
  }
};

export const generateTopicFlashcards = async (
  topic: string,
  count: number,
  options: TopicFlashcardGenerationOptions = {},
): Promise<Array<{ front: string; back: string }>> => {
  if (!activeApiKey) {
    throw new Error('AI not initialized.');
  }

  const requestedCount = Math.max(1, Math.min(100, Math.round(count)));
  const normalizedTopic = topic.trim().replace(/\s+/g, ' ');
  const normalizedAdditionalInformation = (options.additionalInformation || '').trim();

  if (!normalizedTopic) {
    throw new Error('Topic is required to generate flashcards.');
  }

  const additionalInformationSection = normalizedAdditionalInformation
    ? `\nAdditional information:\n${normalizedAdditionalInformation}\n`
    : '';

  const prompt = `Generate exactly ${requestedCount} high-quality study flashcards about "${normalizedTopic}".
${additionalInformationSection}
Rules:
- Use concise but meaningful questions on the front side.
- Use clear, correct, learner-friendly answers on the back side.
- Avoid duplicates.
- Keep each flashcard self-contained.
You MUST respond with valid JSON ONLY in this schema:
{
  "flashcards": [
    {
      "front": "Question",
      "back": "Answer"
    }
  ]
}`;

  const history = Array.isArray(options.history) ? options.history : [];
  const payload = {
    systemInstruction: {
      parts: [{ text: 'You are an expert educator. Output valid JSON ONLY.' }],
    },
    contents: createRequestContents(history, prompt),
    generationConfig: {
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  };

  addLog('llm_prompt', `Generating topic flashcards using ${activeModelId}`, payload);

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModelId)}` +
    `:generateContent?key=${encodeURIComponent(activeApiKey)}`;
  const endpointForLogs = `models/${activeModelId}:generateContent`;
  const requestStartedAt = Date.now();
  let httpStatus: number | undefined;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    httpStatus = response.status;
    if (!response.ok) {
      throw new Error(`Gemini request failed with status ${response.status}.`);
    }

    const data = await response.json();
    const text = parseChunkText(data);
    if (!text) {
      throw new Error('Gemini returned an empty topic flashcards response.');
    }

    addLog('llm_response', `Received topic flashcards response from ${activeModelId}`, { text });
    return parseTopicFlashcardsResult(text).slice(0, requestedCount);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Gemini topic flashcards request failed unexpectedly.';
    addLog('error', 'Gemini topic flashcards request failed', {
      requestType: 'flashcards_topic_generation',
      modelId: activeModelId,
      endpoint: endpointForLogs,
      errorMessage,
      httpStatus,
      durationMs: Date.now() - requestStartedAt,
    });

    if (error instanceof Error) throw error;
    throw new Error('Gemini topic flashcards request failed.');
  }
};

const requestJsonFromGemini = async (
  prompt: string,
  requestType: 'words_topic_generation' | 'words_translation' | 'words_description',
  promptLogLabel: string,
  responseLogLabel: string,
  maxOutputTokens: number = 8192,
): Promise<string> => {
  if (!activeApiKey) {
    throw new Error('AI not initialized.');
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: 'You are an expert language tutor. Output valid JSON ONLY.' }],
    },
    contents: createRequestContents([], prompt),
    generationConfig: {
      maxOutputTokens,
      responseMimeType: 'application/json',
    },
  };

  addLog('llm_prompt', `${promptLogLabel} using ${activeModelId}`, payload);

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModelId)}` +
    `:generateContent?key=${encodeURIComponent(activeApiKey)}`;
  const endpointForLogs = `models/${activeModelId}:generateContent`;
  const requestStartedAt = Date.now();
  let httpStatus: number | undefined;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    httpStatus = response.status;
    if (!response.ok) {
      throw new Error(`Gemini request failed with status ${response.status}.`);
    }

    const data = await response.json();
    const text = parseChunkText(data);

    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }

    addLog('llm_response', `${responseLogLabel} from ${activeModelId}`, { text });
    return text;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Gemini words request failed unexpectedly.';
    addLog('error', 'Gemini words request failed', {
      requestType,
      modelId: activeModelId,
      endpoint: endpointForLogs,
      errorMessage,
      httpStatus,
      durationMs: Date.now() - requestStartedAt,
    });

    if (error instanceof Error) throw error;
    throw new Error('Gemini words request failed.');
  }
};

export const generateTopicWords = async (
  topic: string,
  count: number,
  targetLanguage: string,
): Promise<string[]> => {
  const requestedCount = Math.max(1, Math.min(100, Math.round(count)));
  const normalizedTopic = topic.trim();
  const normalizedTargetLanguage = targetLanguage.trim() || 'English';

  if (!normalizedTopic) {
    throw new Error('Topic is required to generate words.');
  }

  const prompt = `Generate exactly ${requestedCount} single-word vocabulary items related to topic "${normalizedTopic}" in ${normalizedTargetLanguage}.
Rules:
- Return only words in ${normalizedTargetLanguage}.
- Avoid duplicates.
- Avoid proper nouns where possible.
- Prefer broadly useful vocabulary.
You MUST respond with valid JSON only using this schema:
{
  "words": ["word1", "word2"]
}`;

  const text = await requestJsonFromGemini(
    prompt,
    'words_topic_generation',
    'Generating topic words',
    'Received topic words response',
  );

  return parseTopicWordsResult(text).slice(0, requestedCount);
};

export const translateWords = async (
  words: string[],
  targetLanguage: string,
  nativeLanguage: string,
): Promise<Record<string, string>> => {
  const normalizedWords = words
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (normalizedWords.length === 0) return {};

  const normalizedTargetLanguage = targetLanguage.trim() || 'English';
  const normalizedNativeLanguage = nativeLanguage.trim() || 'English';

  const prompt = `Translate each word from ${normalizedTargetLanguage} to ${normalizedNativeLanguage}.
Words:
${JSON.stringify(normalizedWords)}
You MUST respond with valid JSON only using this schema:
{
  "translations": [
    { "word": "example", "translation": "translation" }
  ]
}
Return every word exactly once.`;

  const text = await requestJsonFromGemini(
    prompt,
    'words_translation',
    'Generating word translations',
    'Received word translations response',
  );

  return parseWordTranslationsResult(text);
};

export const describeWords = async (
  words: string[],
  targetLanguage: string,
): Promise<Record<string, WordDescription>> => {
  const normalizedWords = words
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (normalizedWords.length === 0) return {};

  const normalizedTargetLanguage = targetLanguage.trim() || 'English';

  const prompt = `For each word below, write a clear learner-friendly definition and one natural example sentence in ${normalizedTargetLanguage}.
Words:
${JSON.stringify(normalizedWords)}
You MUST respond with valid JSON only using this schema:
{
  "descriptions": [
    {
      "word": "example",
      "definition": "definition in ${normalizedTargetLanguage}",
      "example": "example sentence in ${normalizedTargetLanguage}"
    }
  ]
}
Return every word exactly once.`;

  const text = await requestJsonFromGemini(
    prompt,
    'words_description',
    'Generating word descriptions',
    'Received word descriptions response',
  );

  return parseWordDescriptionsResult(text);
};

export const enrichWordWithLLM = async (
  word: string,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<WordEnrichment> => {
  const normalizedWord = word.trim().replace(/\s+/g, ' ');
  if (!normalizedWord) {
    throw new Error('Word is required for enrichment.');
  }

  const [translations, descriptions] = await Promise.all([
    translateWords([normalizedWord], targetLanguage, nativeLanguage),
    describeWords([normalizedWord], targetLanguage),
  ]);

  const lookupKey = normalizeWordLookupKey(normalizedWord);
  const translation = translations[lookupKey];
  const description = descriptions[lookupKey];

  if (!translation || !description) {
    throw new Error('Generated word enrichment is incomplete.');
  }

  return {
    word: normalizedWord,
    translation,
    definition: description.definition,
    example: description.example,
  };
};
