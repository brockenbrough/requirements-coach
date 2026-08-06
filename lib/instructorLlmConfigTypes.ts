/**
 * GitHub #150: types for the instructor's LLM provider settings page. Field names/provider ids
 * mirror what already exists for real — supabase/schema.sql's instructor_llm_config table and
 * lib/llm/factory.ts's getLLMProvider(provider, apiKey) — so the provider ids here are not
 * invented; they're the exact three lib/llm already has a working provider class for.
 */
export type LLMProviderId = 'CLAUDE' | 'CHATGPT' | 'GEMINI';

export const LLM_PROVIDERS: { id: LLMProviderId; label: string }[] = [
  { id: 'CLAUDE', label: 'Anthropic Claude' },
  { id: 'CHATGPT', label: 'OpenAI ChatGPT' },
  { id: 'GEMINI', label: 'Google Gemini' },
];

/**
 * Model catalog per provider — every model each API currently still serves, newest first, not
 * just the latest generation (checked against each provider's current docs; anything actually
 * shut down, e.g. gemini-2.0-flash and o4-mini, is left out rather than offered as a dead
 * option). This means the settings page now offers newer models than lib/llm/providers/*.ts's
 * own hardcoded MODEL constants (claude-opus-5 still matches; gpt-4o-mini and gemini-2.0-flash
 * do not — the latter has in fact been shut down). Picking a model here doesn't change what a
 * real grading call uses yet either way — see lib/instructorLlmConfigClient.ts for what a real
 * integration needs, which now includes updating those provider classes' own hardcoded models.
 *
 * The three newest Claude ids are exact (from Anthropic's own current model list); everything
 * else is best-effort from provider docs/changelogs rather than individually re-verified —
 * good enough for a mock dropdown, not something a real integration should trust byte-for-byte.
 */
export const LLM_MODELS_BY_PROVIDER: Record<LLMProviderId, { id: string; label: string }[]> = {
  CLAUDE: [
    { id: 'claude-opus-5', label: 'Claude Opus 5' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'claude-fable-5', label: 'Claude Fable 5' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  ],
  CHATGPT: [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    { id: 'gpt-5.5', label: 'GPT-5.5' },
    { id: 'gpt-5.3-codex', label: 'GPT-5.3-Codex' },
    { id: 'gpt-5.2-instant', label: 'GPT-5.2 Instant' },
  ],
  GEMINI: [
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
    // Still served as of writing, but Google has announced both for shutdown on Oct 16, 2026.
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (retiring Oct 2026)' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (retiring Oct 2026)' },
  ],
};

/**
 * What the client is ever allowed to see of instructor_llm_config — no api_key column. The
 * schema's own comment on that table says a service-role route is "responsible for masking it
 * before it reaches the client"; hasApiKey (not the key itself) is that masking.
 */
export type InstructorLlmConfig = {
  provider: LLMProviderId;
  model: string;
  hasApiKey: boolean;
  updatedAt: string;
};
