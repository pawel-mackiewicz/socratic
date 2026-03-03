import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { addLogMock } = vi.hoisted(() => ({
  addLogMock: vi.fn(),
}));

vi.mock('./logger', () => ({
  addLog: addLogMock,
}));

import {
  describeWords,
  enrichWordWithLLM,
  evaluateFlashcardAnswer,
  generateTopicFlashcards,
  generateTopicWords,
  initializeAI,
  sendMessageToAI,
  setActiveModel,
  translateWords,
} from './ai-service';

const createAbortablePendingFetch = () =>
  vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;

      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      signal.addEventListener(
        'abort',
        () => {
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  });

const createSseResponseThatStallsAfterFirstChunk = (signal: AbortSignal): Response => {
  const encoder = new TextEncoder();
  const firstChunk = encoder.encode(
    'data: {"candidates":[{"content":{"parts":[{"text":"Chunk 1"}]}}]}\n\n',
  );
  let readCount = 0;

  const reader = {
    read: (): Promise<ReadableStreamReadResult<Uint8Array>> => {
      if (readCount === 0) {
        readCount += 1;
        return Promise.resolve({ done: false, value: firstChunk });
      }

      return new Promise<ReadableStreamReadResult<Uint8Array>>((_resolve, reject) => {
        const onAbort = () => {
          reject(new DOMException('Aborted', 'AbortError'));
        };

        if (signal.aborted) {
          onAbort();
          return;
        }

        signal.addEventListener('abort', onAbort, { once: true });
      });
    },
  };

  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/event-stream' : null),
    },
    body: {
      getReader: () => reader,
    },
  } as unknown as Response;
};

const findErrorLogDetails = (): unknown => {
  const errorCall = addLogMock.mock.calls.find(([type]) => type === 'error');
  if (!errorCall) return null;
  return errorCall[2];
};

const createGenerateContentResponse = (text: string, status: number = 200): Response => {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text }],
          },
        },
      ],
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
};

describe('sendMessageToAI', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    initializeAI('secret-key');
    setActiveModel('gemini-2.5-flash');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('aborts with first-token timeout and logs structured error details', async () => {
    const fetchMock = createAbortablePendingFetch();
    vi.stubGlobal('fetch', fetchMock);

    const pending = sendMessageToAI('hello', [], vi.fn(), {
      firstTokenTimeoutMs: 30_000,
      betweenChunksTimeoutMs: 120_000,
      requestContext: {
        conversationId: 'conv-idle',
        aiMessageId: 'ai-idle',
        trigger: 'send',
      },
    });
    const assertion = expect(pending).rejects.toThrow('first response token within 30 seconds');

    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;

    expect(addLogMock).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('first_token_timeout'),
      expect.objectContaining({
        errorCategory: 'first_token_timeout',
        conversationId: 'conv-idle',
        aiMessageId: 'ai-idle',
        trigger: 'send',
      }),
    );

    const details = findErrorLogDetails();
    expect(details).not.toBeNull();
    expect(JSON.stringify(details)).not.toContain('secret-key');
  });

  it('aborts with between-tokens timeout and logs structured error details', async () => {
    const onChunk = vi.fn();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      if (!signal) {
        throw new Error('Missing abort signal');
      }
      return Promise.resolve(createSseResponseThatStallsAfterFirstChunk(signal));
    });

    vi.stubGlobal('fetch', fetchMock);

    const pending = sendMessageToAI('hello', [], onChunk, {
      firstTokenTimeoutMs: 150_000,
      betweenChunksTimeoutMs: 25_000,
      requestContext: {
        conversationId: 'conv-max',
        aiMessageId: 'ai-max',
        trigger: 'retry',
      },
    });
    const assertion = expect(pending).rejects.toThrow('more than 25 seconds');

    await vi.advanceTimersByTimeAsync(25_001);
    await assertion;
    expect(onChunk).toHaveBeenCalledWith('Chunk 1');

    expect(addLogMock).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('between_tokens_timeout'),
      expect.objectContaining({
        errorCategory: 'between_tokens_timeout',
        conversationId: 'conv-max',
        aiMessageId: 'ai-max',
        trigger: 'retry',
      }),
    );
  });

  it('logs http_error category and status when Gemini returns non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('failed', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    );

    await expect(sendMessageToAI('hello', [], vi.fn())).rejects.toThrow('status 500');

    expect(addLogMock).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('http_error'),
      expect.objectContaining({
        errorCategory: 'http_error',
        httpStatus: 500,
      }),
    );
  });

  it('logs network_error category when fetch fails before response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    await expect(sendMessageToAI('hello', [], vi.fn())).rejects.toThrow(
      'Network error while contacting Gemini',
    );

    expect(addLogMock).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('network_error'),
      expect.objectContaining({
        errorCategory: 'network_error',
      }),
    );
  });
});

describe('evaluateFlashcardAnswer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeAI('secret-key');
    setActiveModel('gemini-2.5-flash');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses valid flashcard evaluation payload', async () => {
    const evaluationJson = JSON.stringify({
      score: 4,
      argumentation: 'Mostly correct, but one key detail is missing.',
      tips: ['Mention the missing detail explicitly.', 'Add one concrete example.'],
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGenerateContentResponse(evaluationJson)),
    );

    await expect(
      evaluateFlashcardAnswer('What is closure?', 'Closure captures lexical scope.', 'It remembers variables.'),
    ).resolves.toEqual({
      score: 4,
      argumentation: 'Mostly correct, but one key detail is missing.',
      tips: ['Mention the missing detail explicitly.', 'Add one concrete example.'],
    });
  });

  it('rejects malformed JSON output from Gemini', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGenerateContentResponse('{not-json')),
    );

    await expect(
      evaluateFlashcardAnswer('Q', 'A', 'User answer'),
    ).rejects.toThrow('Failed to parse flashcard evaluation JSON');

    expect(addLogMock).toHaveBeenCalledWith(
      'error',
      'Gemini flashcard evaluation request failed',
      expect.objectContaining({
        requestType: 'flashcard_evaluation',
      }),
    );
  });

  it('rejects invalid flashcard evaluation schema', async () => {
    const invalidSchemaJson = JSON.stringify({
      score: 2,
      argumentation: 'Needs work.',
      tips: [],
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGenerateContentResponse(invalidSchemaJson)),
    );

    await expect(
      evaluateFlashcardAnswer('Q', 'A', 'User answer'),
    ).rejects.toThrow('Flashcard evaluation tips must include at least one tip.');
  });

  it('fails when Gemini returns non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('failed', { status: 503 })),
    );

    await expect(
      evaluateFlashcardAnswer('Q', 'A', 'User answer'),
    ).rejects.toThrow('Gemini request failed with status 503.');
  });

  it('clamps out-of-range score into 0..5 range', async () => {
    const outOfRangeScoreJson = JSON.stringify({
      score: 9,
      argumentation: 'Correct answer.',
      tips: ['Stay concise.'],
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGenerateContentResponse(outOfRangeScoreJson)),
    );

    await expect(
      evaluateFlashcardAnswer('Q', 'A', 'User answer'),
    ).resolves.toEqual({
      score: 5,
      argumentation: 'Correct answer.',
      tips: ['Stay concise.'],
    });
  });
});

describe('word generation APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeAI('secret-key');
    setActiveModel('gemini-2.5-flash');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses topic words result', async () => {
    const wordsJson = JSON.stringify({
      words: ['travel', 'ticket', 'airport'],
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGenerateContentResponse(wordsJson)),
    );

    await expect(generateTopicWords('travel', 3, 'English')).resolves.toEqual([
      'travel',
      'ticket',
      'airport',
    ]);
  });

  it('parses translations keyed by normalized word', async () => {
    const translationsJson = JSON.stringify({
      translations: [
        { word: 'travel', translation: 'podroz' },
        { word: 'ticket', translation: 'bilet' },
      ],
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGenerateContentResponse(translationsJson)),
    );

    await expect(translateWords(['travel', 'ticket'], 'English', 'Polish')).resolves.toEqual({
      travel: 'podroz',
      ticket: 'bilet',
    });
  });

  it('parses descriptions with required definition and example', async () => {
    const descriptionsJson = JSON.stringify({
      descriptions: [
        {
          word: 'travel',
          definition: 'To go from one place to another.',
          example: 'I travel to work by train.',
        },
      ],
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGenerateContentResponse(descriptionsJson)),
    );

    await expect(describeWords(['travel'], 'English')).resolves.toEqual({
      travel: {
        definition: 'To go from one place to another.',
        example: 'I travel to work by train.',
      },
    });
  });

  it('enriches a single word by combining translation and description calls', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createGenerateContentResponse(JSON.stringify({
        translations: [{ word: 'travel', translation: 'podroz' }],
      })))
      .mockResolvedValueOnce(createGenerateContentResponse(JSON.stringify({
        descriptions: [
          {
            word: 'travel',
            definition: 'To go from one place to another.',
            example: 'I travel often.',
          },
        ],
      })));

    vi.stubGlobal('fetch', fetchMock);

    await expect(enrichWordWithLLM('travel', 'English', 'Polish')).resolves.toEqual({
      word: 'travel',
      translation: 'podroz',
      definition: 'To go from one place to another.',
      example: 'I travel often.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('topic flashcards generation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeAI('secret-key');
    setActiveModel('gemini-2.5-flash');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses topic flashcards result and normalizes entries', async () => {
    const flashcardsJson = JSON.stringify({
      flashcards: [
        { front: ' What is closure? ', back: ' Capturing lexical scope. ' },
        { front: 'What is closure?', back: 'Duplicate front should be removed.' },
        { front: ' ', back: 'Invalid entry' },
      ],
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGenerateContentResponse(flashcardsJson)),
    );

    await expect(generateTopicFlashcards('JavaScript', 10)).resolves.toEqual([
      { front: 'What is closure?', back: 'Capturing lexical scope.' },
    ]);
  });

  it('passes additional information and history in request payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createGenerateContentResponse(JSON.stringify({
      flashcards: [{ front: 'Q1', back: 'A1' }],
    })));

    vi.stubGlobal('fetch', fetchMock);

    await generateTopicFlashcards('JavaScript', 3, {
      additionalInformation: 'Focus on async and promises.',
      history: [
        { role: 'user', content: 'We talked about callbacks.' },
        { role: 'ai', content: 'And event loop fundamentals.' },
      ],
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    };

    expect(requestBody.contents).toHaveLength(3);
    expect(requestBody.contents[0].role).toBe('user');
    expect(requestBody.contents[1].role).toBe('model');
    expect(requestBody.contents[2].parts[0].text).toContain('Additional information:');
    expect(requestBody.contents[2].parts[0].text).toContain('Focus on async and promises.');
  });

  it('rejects malformed topic flashcards JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGenerateContentResponse('{not-json')),
    );

    await expect(generateTopicFlashcards('Databases', 5)).rejects.toThrow(
      'Failed to parse generated topic flashcards JSON',
    );
  });

  it('rejects invalid schema for topic flashcards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGenerateContentResponse(JSON.stringify({ wrong: [] }))),
    );

    await expect(generateTopicFlashcards('Databases', 5)).rejects.toThrow(
      'Topic flashcards JSON schema is invalid.',
    );
  });

  it('clamps requested count and slices returned flashcards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createGenerateContentResponse(JSON.stringify({
        flashcards: [
          { front: 'Q1', back: 'A1' },
          { front: 'Q2', back: 'A2' },
          { front: 'Q3', back: 'A3' },
        ],
      }))),
    );

    await expect(generateTopicFlashcards('Databases', 2)).resolves.toEqual([
      { front: 'Q1', back: 'A1' },
      { front: 'Q2', back: 'A2' },
    ]);
  });
});
