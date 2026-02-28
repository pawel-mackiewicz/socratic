# Post-Refactor Future Improvements

## High priority
1. Remove unused dependencies after confirmation (`puppeteer`, `framer-motion`) and regenerate lockfile.
2. Add integration tests for core app flows (bootstrap, send message streaming, flashcard generation/review, conversation delete fallback).
3. Replace `alert(...)` error handling with a shared non-blocking toast/banner system.
4. Add stronger runtime validation for localStorage payloads (schema-based parsing) before state hydration.
5. Add request-cancellation support for chat/flashcard requests (`AbortController`) to avoid stale updates.

## Medium priority
1. Add error boundaries around main app sections (chat, flashcards, logs modal).
2. Improve accessibility: better keyboard semantics, focus management for logs modal, and screen-reader labels for icon-only controls.
3. Split large CSS files into feature-scoped styles (`chat`, `flashcards`, `sidebar`, `setup`) while preserving theme tokens.
4. Add explicit loading/empty/error UI states for model fetch and flashcard generation.
5. Add analytics/log metadata for request duration, token usage (if available), and error categories.

## Long-term
1. Move Gemini API key handling to a backend proxy to avoid browser-side secret storage.
2. Add end-to-end tests (Playwright/Cypress) for critical user journeys.
3. Introduce CI gates (`lint`, `test`, `build`) on pull requests.
4. Evaluate gradual migration to feature folders with stricter module boundaries if codebase grows.
5. Add offline/slow-network resilience (retry strategy, backoff, and connectivity-aware messaging).
