import type { FormEvent } from 'react';

interface SetupScreenProps {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  isModelLoading: boolean;
  setupError: string | null;
}

export function SetupScreen({
  apiKey,
  onApiKeyChange,
  onSubmit,
  isModelLoading,
  setupError,
}: SetupScreenProps) {
  return (
    <div className="app-container setup-container">
      <div className="setup-card">
        <div className="setup-header">
          <div className="setup-icon">🧠</div>
          <h1>AI Teacher</h1>
          <p>Welcome to your Socratic guide. Enter your Gemini API key to begin.</p>
        </div>
        <form className="setup-form" onSubmit={onSubmit}>
          <input
            type="password"
            placeholder="Enter Gemini API Key (AIzaSy...)"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary" disabled={isModelLoading}>
            {isModelLoading ? 'Connecting...' : 'Begin Journey'}
          </button>
        </form>
        {setupError ? <p className="setup-error">{setupError}</p> : null}
        <div className="setup-warning" role="alert">
          <strong>Security warning:</strong> API keys stored in browser storage are vulnerable to theft by malicious
          scripts or browser extensions. Use this mode only for personal/local use.
        </div>
        <div className="setup-footer">
          This app does not send your key to your own backend, but browser-side storage is not a secure vault.
        </div>
      </div>
    </div>
  );
}
