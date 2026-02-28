import { SYSTEM_PROMPT } from './prompt';

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

export interface FetchModelsResult {
  models: string[];
  warning?: string;
  usedFallback: boolean;
}

const GEMINI_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

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
): Promise<string> => {
  if (!activeApiKey) {
    throw new Error('AI not initialized.');
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: createRequestContents(history, message),
    generationConfig: {
      maxOutputTokens: 8192,
    },
  };

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModelId)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(activeApiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Gemini request was rejected. Check your API key and permissions.');
  }

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}.`);
  }

  return processSseResponse(response, onChunk);
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
