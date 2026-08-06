'use client';

// GitHub #150: client for the instructor LLM provider settings page.
//
// No real backend route exists for this yet (nothing under app/api/instructor/llm-config or
// similar — searched before writing this). supabase/schema.sql's instructor_llm_config table
// and lib/llm/factory.ts's getLLMProvider already exist for real, so the shapes below are
// modeled on that table's columns (see lib/instructorLlmConfigTypes.ts) rather than invented.
//
// Still missing for a real, secure backend integration:
//   - GET  /api/instructor/llm-config  → requireInstructor() (lib/instructorAuth.ts), then
//     read the caller's own instructor_llm_config row and return { provider, model, hasApiKey,
//     updatedAt } — never api_key itself.
//   - POST /api/instructor/llm-config  → requireInstructor(), validate provider is one
//     getLLMProvider recognizes, upsert the row keyed by user_id. api_key must never be logged
//     (no console.log/error of the request body or the row), and should be encrypted at rest,
//     not stored as plain text the way the current schema.sql column does — that's a schema
//     change (e.g. pgsodium/pgcrypto) beyond what this UI issue covers.
//   - instructor_llm_config has no `model` column at all yet, and every *Provider.ts class
//     (lib/llm/providers/) hardcodes a single MODEL constant instead of accepting one — a real
//     integration needs both a schema column and each provider class/getLLMProvider threading
//     the chosen model through to its API call.
//   - uq_instructor_llm_config_one_active is a *global* partial unique index — only one row in
//     the whole table can have is_active = true at a time (grading has no per-instructor/course
//     scoping yet). This mock has no is_active concept at all; a real route needs to decide how
//     "Save" here relates to activating a config for the whole app, which isn't specified by
//     this issue's acceptance criteria.
//   - Rate limiting / key format validation per provider, so a typo'd key fails fast instead of
//     surfacing as a confusing grading-time error later.

import type { InstructorLlmConfig, LLMProviderId } from './instructorLlmConfigTypes';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const MOCK_DELAY_MS = 500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Module-level "server" — resets on a hard reload, same as every other not-yet-backed mock in
// this codebase (lib/mockQuestions.ts, lib/mockUserStories.ts). Deliberately not localStorage:
// even mocked, an API key has no business sitting in the browser's persistent storage.
let mockConfig: InstructorLlmConfig | null = null;

/** Mocks GET .../llm-config: the signed-in instructor's current provider + whether a key is saved. */
export async function loadLlmConfig(token: string): Promise<ApiResult<{ config: InstructorLlmConfig | null }>> {
  void token;
  await delay(MOCK_DELAY_MS);
  return { ok: true, data: { config: mockConfig } };
}

/**
 * Mocks POST .../llm-config: saves provider, model, and key together. All three are required —
 * LLMProviderSettingsForm only calls this once its own canSave check (provider + model + a
 * non-blank key) passes, so an empty apiKey here would mean that check was bypassed.
 */
export async function saveLlmConfig(
  token: string,
  provider: LLMProviderId,
  model: string,
  apiKey: string,
): Promise<ApiResult<{ config: InstructorLlmConfig }>> {
  void token;
  await delay(MOCK_DELAY_MS);

  if (!apiKey.trim()) {
    return { ok: false, status: 400, error: 'API key is required.' };
  }

  mockConfig = { provider, model, hasApiKey: true, updatedAt: new Date().toISOString() };
  return { ok: true, data: { config: mockConfig } };
}
