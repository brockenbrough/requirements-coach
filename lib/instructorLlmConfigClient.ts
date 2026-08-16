'use client';

// GitHub #150: client for the instructor LLM provider settings page. Same role as
// lib/llmActivityClient.ts for the write-acceptance-criteria flow: the one place the UI
// talks to GET/POST /api/instructor/llm-config, so no component hand-rolls the Authorization
// header or picks apart an error body.

import {
  getCachedLlmConfig,
  getCachedLlmConfigForSelection,
  setCachedLlmConfig,
  setCachedLlmConfigForSelection,
} from './instructorLlmConfigStore';
import type { InstructorLlmConfig, LLMProviderId } from './instructorLlmConfigTypes';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const NETWORK_ERROR = 'Could not reach the server. Please try again.';

async function request<T>(url: string, init: RequestInit, token: string): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  } catch {
    // status 0 marks "never reached the server", so callers can tell it apart from a 500.
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, status: response.status, error: body?.error || 'Something went wrong.' };
  }

  return { ok: true, data: body as T };
}

// The raw row app/api/instructor/llm-config/route.ts returns (its CONFIG_COLUMNS) — never
// includes api_key.
type ConfigRow = {
  instructor_llm_config_id: string;
  provider: string;
  model: string;
  is_active: boolean;
  updated_at: string;
};

// is_active is a global "which config grading currently defaults to" flag, unrelated to
// whether *this* row has a key — POST 400s on a blank apiKey, so every row the API ever
// returns has one by construction. "A row exists" is exactly "a key is saved".
function toInstructorLlmConfig(row: ConfigRow | null): InstructorLlmConfig | null {
  if (!row) return null;
  return {
    provider: row.provider as LLMProviderId,
    model: row.model,
    hasApiKey: true,
    updatedAt: row.updated_at,
  };
}

/**
 * GET .../llm-config: the signed-in instructor's own most recently saved config, if any.
 *
 * Cached in localStorage (lib/instructorLlmConfigStore.ts) when userId is given — the same
 * "optional key opts into the cache" shape as lib/sessionClient.ts's loadSessions, since userId
 * (from useUser()'s profile) may not have loaded yet when this is first called. A plain call is
 * served from the cache when present; pass forceRefresh to bypass it and re-cache the server's
 * answer.
 */
export async function loadLlmConfig(
  token: string,
  options: { userId?: string; forceRefresh?: boolean } = {},
): Promise<ApiResult<{ config: InstructorLlmConfig | null }>> {
  if (options.userId && !options.forceRefresh) {
    const cached = getCachedLlmConfig(options.userId);
    if (cached !== null) return { ok: true, data: cached };
  }

  const result = await request<{ config: ConfigRow | null }>('/api/instructor/llm-config', { method: 'GET' }, token);
  if (!result.ok) return result;

  const data = { config: toInstructorLlmConfig(result.data.config) };
  if (options.userId) setCachedLlmConfig(options.userId, data);
  return { ok: true, data };
}

/**
 * GET .../llm-config?provider=&model=: does the instructor have a previously saved key for
 * this *exact* provider/model pair? Distinct from loadLlmConfig's unfiltered "most recent
 * config overall" — POST never updates in place, so an earlier pair can still have a saved key
 * even once a different pair becomes the most recent save.
 *
 * Same cache shape as loadLlmConfig, keyed additionally by provider+model.
 */
export async function checkLlmConfigForSelection(
  token: string,
  provider: LLMProviderId,
  model: string,
  options: { userId?: string; forceRefresh?: boolean } = {},
): Promise<ApiResult<{ config: InstructorLlmConfig | null }>> {
  if (options.userId && !options.forceRefresh) {
    const cached = getCachedLlmConfigForSelection(options.userId, provider, model);
    if (cached !== null) return { ok: true, data: cached };
  }

  const params = new URLSearchParams({ provider, model });
  const result = await request<{ config: ConfigRow | null }>(
    `/api/instructor/llm-config?${params.toString()}`,
    { method: 'GET' },
    token,
  );
  if (!result.ok) return result;

  const data = { config: toInstructorLlmConfig(result.data.config) };
  if (options.userId) setCachedLlmConfigForSelection(options.userId, provider, model, data);
  return { ok: true, data };
}

/**
 * POST .../llm-config: saves provider, model, and key together. All three are required —
 * LLMProviderSettingsForm only calls this once its own canSave check (provider + model + a
 * non-blank key) passes, but the route validates independently regardless.
 *
 * setActive is intentionally omitted: the settings form has no control for it, and grading
 * (app/api/activities/write-acceptance-criteria/submissions/route.ts) scopes by the story's
 * creator_id, not by the global is_active flag, so there's nothing here for it to affect.
 *
 * On success, writes through to both caches — the pair just saved, and the "most recent
 * overall" slot, since a fresh save *is* now the most recent — no extra round trip needed, the
 * response here is already the authoritative new state.
 */
export async function saveLlmConfig(
  token: string,
  provider: LLMProviderId,
  model: string,
  apiKey: string,
  options: { userId?: string } = {},
): Promise<ApiResult<{ config: InstructorLlmConfig }>> {
  const result = await request<{ config: ConfigRow }>(
    '/api/instructor/llm-config',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, apiKey }),
    },
    token,
  );

  if (!result.ok) return result;

  const data = { config: toInstructorLlmConfig(result.data.config)! };
  if (options.userId) {
    setCachedLlmConfigForSelection(options.userId, provider, model, data);
    setCachedLlmConfig(options.userId, data);
  }
  return { ok: true, data };
}
