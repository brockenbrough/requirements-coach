'use client';

// GitHub #150: client for the instructor LLM provider settings page. Same role as
// lib/acceptanceCriteriaClient.ts for the write-acceptance-criteria flow: the one place the UI
// talks to GET/POST /api/instructor/llm-config, so no component hand-rolls the Authorization
// header or picks apart an error body.

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

/** GET .../llm-config: the signed-in instructor's own most recently saved config, if any. */
export async function loadLlmConfig(token: string): Promise<ApiResult<{ config: InstructorLlmConfig | null }>> {
  const result = await request<{ config: ConfigRow | null }>('/api/instructor/llm-config', { method: 'GET' }, token);
  if (!result.ok) return result;
  return { ok: true, data: { config: toInstructorLlmConfig(result.data.config) } };
}

/**
 * POST .../llm-config: saves provider, model, and key together. All three are required —
 * LLMProviderSettingsForm only calls this once its own canSave check (provider + model + a
 * non-blank key) passes, but the route validates independently regardless.
 *
 * setActive is intentionally omitted: the settings form has no control for it, and grading
 * (app/api/activities/write-acceptance-criteria/submissions/route.ts) scopes by the story's
 * creator_id, not by the global is_active flag, so there's nothing here for it to affect.
 */
export async function saveLlmConfig(
  token: string,
  provider: LLMProviderId,
  model: string,
  apiKey: string,
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
  return { ok: true, data: { config: toInstructorLlmConfig(result.data.config)! } };
}
