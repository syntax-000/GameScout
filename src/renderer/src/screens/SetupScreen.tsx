import { useState, type FormEvent } from 'react';
import type { SettingsStatus, SetupResource } from '../../../shared/ipc/contracts';

interface SetupScreenProps {
  settings: SettingsStatus;
  onConfigured: (settings: SettingsStatus) => void;
  onContinue: () => void;
}

export function SetupScreen({ settings, onConfigured, onContinue }: SetupScreenProps) {
  const [apiKey, setApiKey] = useState('');
  const [attributionAccepted, setAttributionAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi) {
      setError('Desktop bridge unavailable.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await desktopApi.saveProviderSetup(apiKey, attributionAccepted);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setApiKey('');
      onConfigured(result.settings);
      onContinue();
    } catch {
      setError('Provider setup could not be saved.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-view setup-view" aria-labelledby="setup-title">
      <header className="page-header">
        <div>
          <p className="page-kicker">Provider setup</p>
          <h1 id="setup-title">Connect GameScout</h1>
        </div>
      </header>

      <div className="setup-stack">
        <section className="setup-panel" aria-labelledby="provider-title">
          <div className="setup-provider-copy">
            <span className="provider-badge">Primary source</span>
            <h2 id="provider-title">Steam</h2>
            <p>
              GameScout uses Valve&apos;s Steam Web API and public Steam Store metadata. Your API
              key is encrypted by the operating system and never returned to the renderer after
              setup.
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => openResource('steamKey', setError)}
            >
              Manage your Steam Web API key
            </button>
          </div>
          <span
            className={settings.primaryProviderConfigured ? 'status-chip ready' : 'status-chip'}
          >
            {settings.primaryProviderConfigured ? 'Configured' : 'Setup required'}
          </span>
        </section>

        {settings.primaryProviderConfigured ? (
          <section className="setup-form-panel configured-panel" aria-label="Provider configured">
            <div>
              <h2>Steam Web API key saved</h2>
              <p>Your Steam key is stored locally and is not displayed again.</p>
            </div>
            <button type="button" className="primary-button" onClick={onContinue}>
              Continue to Browse
            </button>
          </section>
        ) : null}

        <form className="setup-form-panel" onSubmit={handleSubmit} noValidate>
          <div className="form-heading">
            <h2>{settings.primaryProviderConfigured ? 'Replace API key' : 'Steam Web API key'}</h2>
            <p>
              Paste the Steam Web API key you generated. GameScout sends it only to Valve&apos;s Web
              API endpoint.
            </p>
          </div>

          <label className="field-label" htmlFor="steam-api-key">
            Steam Web API key
          </label>
          <input
            id="steam-api-key"
            name="steam-api-key"
            className="text-input"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="32-character Steam Web API key"
            autoComplete="new-password"
            required
          />

          <div className="license-notice">
            <h3>Provider terms</h3>
            <p>
              Game metadata and images are sourced from Steam and shown as-is. Steam Store
              categories can identify modes such as online co-op, LAN co-op, and split-screen, but
              they do not provide exact supported player capacity.
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => openResource('steamTerms', setError)}
            >
              Read the Steam Web API terms
            </button>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={attributionAccepted}
              onChange={(event) => setAttributionAccepted(event.target.checked)}
            />
            <span>I understand the Steam Web API terms notice.</span>
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting
                ? 'Saving...'
                : settings.primaryProviderConfigured
                  ? 'Save replacement'
                  : 'Save and Continue'}
            </button>
          </div>
        </form>

        <p className="steam-note">
          GameScout retrieves a bounded set of recently modified Windows games and caches it locally
          for offline browsing. Current-player values remain point-in-time observations, not
          capacity.
        </p>
      </div>
    </section>
  );
}

async function openResource(
  resource: SetupResource,
  setError: (error: string | null) => void,
): Promise<void> {
  try {
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi) throw new Error('Desktop bridge unavailable.');
    await desktopApi.openSetupResource(resource);
  } catch {
    setError('The documentation link could not be opened.');
  }
}
