# How to start?

```bash
npm install
npm run dev
```

## Chat timeout config

You can tune Gemini chat stream timeouts with Vite env vars (values are in seconds):

- `VITE_CHAT_STREAM_FIRST_TOKEN_TIMEOUT_SECONDS` (default: `100`)
- `VITE_CHAT_STREAM_BETWEEN_TOKENS_TIMEOUT_SECONDS` (default: `25`)

Example:

```bash
cp .env.example .env
```

## Security warning (Gemini API key in browser storage)

This app stores the Gemini API key in browser storage (`localStorage`) when you submit it in the setup screen.

This is convenient for local use, but it is **not secure storage**:
- Any malicious script running in the page context can read it.
- A malicious browser extension can read it.
- Anyone with access to your browser profile/session can potentially extract it.

Use this browser-only mode for personal/local usage only. For production or shared environments, move API key handling to a backend service and never expose the key to client-side JavaScript.
