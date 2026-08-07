'use client';

import { useEffect, useRef, useState } from 'react';
import { PasswordField } from './PasswordField';
import { checkLlmConfigForSelection, loadLlmConfig, saveLlmConfig } from '../lib/instructorLlmConfigClient';
import { LLM_MODELS_BY_PROVIDER, LLM_PROVIDERS, type InstructorLlmConfig, type LLMProviderId } from '../lib/instructorLlmConfigTypes';

const PILL_BASE = 'rounded-full border px-3.5 py-1.5 text-xs font-bold transition';
const PILL_ACTIVE = 'border-brand-purple bg-brand-purple text-white';
const PILL_INACTIVE = 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple';

/**
 * GitHub #150: the instructor LLM provider settings form. Shared by app/instructor/settings/
 * page.tsx (a standalone route, kept for deep links) and LLMProviderSettingsModal.tsx (the
 * primary way instructors reach it, via the sidebar gear icon) — neither host does anything but
 * provide chrome around this component, so there is exactly one place the fields/validation/
 * save logic live.
 *
 * showHeading is false only for the modal host, which renders its own "LLM Provider Settings"
 * title itself — inline with the close button, matching QuestionFormModal's title-next-to-X
 * layout — instead of using this component's own heading. The standalone page leaves it at the
 * default true, since nothing else on that page renders a title for it.
 */
export function LLMProviderSettingsForm({ token, showHeading = true }: { token: string; showHeading?: boolean }) {
  // Always represents "is there a saved key for the *currently selected* provider+model pair" —
  // refreshed via checkSelection() on every change, not derived by comparing against a single
  // cached value. POST never updates a row in place, so an earlier pair can still have a saved
  // key even once a different pair becomes the instructor's most recent save; only the backend
  // can answer "does this exact pair have one."
  const [selectionConfig, setSelectionConfig] = useState<InstructorLlmConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [provider, setProvider] = useState<LLMProviderId>(LLM_PROVIDERS[0].id);
  const [model, setModel] = useState<string>(LLM_MODELS_BY_PROVIDER[LLM_PROVIDERS[0].id][0].id);
  // Always starts blank — even once a config exists, the raw key is never sent back from the
  // server (see lib/instructorLlmConfigClient.ts), so there is nothing to pre-fill it with.
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Tracks the most recently requested pair, so a slower response to an earlier change can't
  // clobber a newer one if the instructor clicks through providers/models quickly.
  const latestSelectionRef = useRef({ provider, model });

  useEffect(() => {
    let cancelled = false;

    loadLlmConfig(token).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        setLoadFailed(true);
        setIsLoading(false);
        return;
      }

      // The unfiltered fetch already returns the row for whichever pair it is — no extra
      // per-pair check call needed to know the answer for this initial selection.
      if (result.data.config) {
        setSelectionConfig(result.data.config);
        setProvider(result.data.config.provider);
        setModel(result.data.config.model);
        latestSelectionRef.current = { provider: result.data.config.provider, model: result.data.config.model };
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function checkSelection(nextProvider: LLMProviderId, nextModel: string) {
    latestSelectionRef.current = { provider: nextProvider, model: nextModel };
    // Clear immediately so the previous pair's "already saved" text doesn't flash for the new
    // pair while the check is in flight.
    setSelectionConfig(null);

    const result = await checkLlmConfigForSelection(token, nextProvider, nextModel);
    const stillCurrent =
      latestSelectionRef.current.provider === nextProvider && latestSelectionRef.current.model === nextModel;
    if (!stillCurrent) return; // superseded by a newer selection before this resolved

    // A failed check is swallowed — this is a secondary UX nicety, not worth a hard error
    // state; the indicator just won't show "already saved" until the next successful check.
    if (result.ok) setSelectionConfig(result.data.config);
  }

  // Switching provider invalidates the previous model choice — each provider's model list is
  // disjoint — so this lands on that provider's first model, same as how the provider pills
  // themselves always have a selected default rather than an empty state. A provider change is
  // a pair change too, so it needs the same live check as a plain model change.
  function handleProviderChange(nextProvider: LLMProviderId) {
    const nextModel = LLM_MODELS_BY_PROVIDER[nextProvider][0].id;
    setProvider(nextProvider);
    setModel(nextModel);
    checkSelection(nextProvider, nextModel);
  }

  function handleModelChange(nextModel: string) {
    setModel(nextModel);
    checkSelection(provider, nextModel);
  }

  const modelOptions = LLM_MODELS_BY_PROVIDER[provider];
  // Provider/model always have a default value (never actually blank), so in practice this
  // gates on the one field that starts empty: the API key.
  const canSave = Boolean(provider && model && apiKeyInput.trim());
  const hasSavedKeyForSelection = Boolean(selectionConfig?.hasApiKey);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !canSave) return;

    setSaveError('');
    setSaveSuccess(false);
    setSubmitting(true);

    const result = await saveLlmConfig(token, provider, model, apiKeyInput);
    setSubmitting(false);

    if (!result.ok) {
      setSaveError(result.error);
      return;
    }

    // Refresh local state straight from the response — the form reflects the new saved config
    // immediately, no refetch/reload needed — and clear the typed key so it never lingers in
    // state once it's been sent. The response is the row for the pair just submitted, so it's
    // exactly what selectionConfig should hold now.
    setSelectionConfig(result.data.config);
    setApiKeyInput('');
    setSaveSuccess(true);
  }

  return (
    <div>
      {showHeading ? <h3 className="mb-1 text-lg font-extrabold">LLM Provider Settings</h3> : null}
      <p className="mb-6 text-sm font-semibold text-gray-500">
        Pick a provider and model, then paste your API key so acceptance-criteria submissions can be graded automatically.
      </p>

      {isLoading ? (
        <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6" role="status" aria-label="Loading settings">
          <span className="mb-4 block h-4 w-1/3 animate-pulse rounded-full bg-gray-200" />
          <span className="mb-2 block h-11 w-full animate-pulse rounded-brand-md bg-gray-200" />
          <span className="block h-11 w-full animate-pulse rounded-brand-md bg-gray-200" />
        </div>
      ) : loadFailed ? (
        <div className="rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
          <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load your settings.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
          >
            Retry
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6">
          <span className="mb-2 block text-sm font-bold text-gray-600">Provider</span>
          <div role="radiogroup" aria-label="LLM provider" className="mb-5 flex flex-wrap gap-1.5">
            {LLM_PROVIDERS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={provider === option.id}
                onClick={() => handleProviderChange(option.id)}
                className={`${PILL_BASE} ${provider === option.id ? PILL_ACTIVE : PILL_INACTIVE}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="mb-5 block text-sm font-bold text-gray-600">
            Model
            <select
              value={model}
              onChange={(event) => handleModelChange(event.target.value)}
              className="mt-1.5 block w-full rounded-brand-md border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-bold text-gray-600 outline-none transition focus:border-brand-purple"
            >
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <PasswordField
            label="API Key"
            value={apiKeyInput}
            onChange={setApiKeyInput}
            placeholder={hasSavedKeyForSelection ? '•••• already saved' : 'Paste your API key'}
            autoComplete="off"
            variant="light"
          />
          {hasSavedKeyForSelection ? (
            <p className="mt-1.5 text-xs font-semibold text-gray-500">
              A key for {LLM_PROVIDERS.find((p) => p.id === provider)?.label} (
              {modelOptions.find((m) => m.id === model)?.label}) is already saved.
            </p>
          ) : null}

          {saveError ? <p className="mt-4 text-sm font-semibold text-brand-danger">{saveError}</p> : null}
          {saveSuccess ? <p className="mt-4 text-sm font-bold text-brand-teal-dark">Saved.</p> : null}

          <button
            type="submit"
            disabled={submitting || !canSave}
            className="mt-5 rounded-brand-md bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
    </div>
  );
}
