## What is this?

I vibecoded it for myself for learning new things. Like CS and new words in Foreign Languages. 
I had it scattered across different apps and tools, so I decided to make a single app from it.

I use it daily; it may be useful for you as well.

AI follows Bloom's Taxonomy (levels 2 to 5) for structuring the learning process.

So it goes:

2. understanding
3. applying
4. analyzing
5. evaluating

And then you can create flashcards with the help of AI from the given topic that you just learned.

There is also section for learning words in different languages - just provide a word, and AI will give you definition, examples and translations.  

Flashcards and word learning uses Spaced Repetition System (SRS) with SuperMemo 2 algorithm.

It uses Gemini API for the heavy lifting. So you need to provide your own API key.

Enjoy.

## How to start?

```bash
npm install
npm run dev
```

## How to use?

1. Open the app in your browser.
2. Provide your Gemini API key.
3. Start learning!


## Security warning (Gemini API key in browser storage)

This app stores the Gemini API key in browser storage (`localStorage`) when you submit it in the setup screen.

This is convenient for local use, but it is **not secure storage**:
- Any malicious script running in the page context can read it.
- A malicious browser extension can read it.
- Anyone with access to your browser profile/session can potentially extract it.

Use this browser-only mode for personal/local usage only. For production or shared environments, move API key handling to a backend service and never expose the key to client-side JavaScript.

