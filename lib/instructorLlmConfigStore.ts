// Local cache for the instructor's LLM provider config (GET /api/instructor/llm-config), so the
// settings screen doesn't have to hit the network on every mount or every provider/model
// switch. Same shape as lib/completedAttemptsStore.ts: a versioned key, an SSR-guarded
// read/write pair, and only typed getter/setter functions exported — never the raw store.
//
// Two independent slots per instructor: the "most recent overall" config (single key, like
// lib/scoreStore.ts) used to prefill the form on mount, and one entry per (provider, model)
// pair actually checked (compound key, like lib/completedAttemptsStore.ts) used by the live
// per-selection check. Both cache { config: InstructorLlmConfig | null } — the wrapper object,
// not the bare config — so a confirmed "no key for this pair" (config: null) is distinguishable
// from "never checked" (no entry at all); a bare null value couldn't tell those apart once read
// back through `store[key] ?? null`.
import type { InstructorLlmConfig, LLMProviderId } from './instructorLlmConfigTypes';

const STORAGE_KEY = 'rc_instructor_llm_config_v1';

type CachedConfig = { config: InstructorLlmConfig | null };
type Store = Partial<Record<string, CachedConfig>>;

function latestKey(userId: string): string {
  return `${userId}:latest`;
}

function selectionKey(userId: string, provider: LLMProviderId, model: string): string {
  return `${userId}:${provider}:${model}`;
}

function readStore(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getCachedLlmConfig(userId: string): CachedConfig | null {
  const store = readStore();
  return store[latestKey(userId)] ?? null;
}

export function setCachedLlmConfig(userId: string, data: CachedConfig): void {
  const store = readStore();
  store[latestKey(userId)] = data;
  writeStore(store);
}

export function getCachedLlmConfigForSelection(
  userId: string,
  provider: LLMProviderId,
  model: string,
): CachedConfig | null {
  const store = readStore();
  return store[selectionKey(userId, provider, model)] ?? null;
}

export function setCachedLlmConfigForSelection(
  userId: string,
  provider: LLMProviderId,
  model: string,
  data: CachedConfig,
): void {
  const store = readStore();
  store[selectionKey(userId, provider, model)] = data;
  writeStore(store);
}
