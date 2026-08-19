// GitHub #520: a small, focused query layer for "does this instructor have an LLM provider
// configured at all" — distinct from app/api/instructor/llm-config/route.ts's own inline queries,
// which read the full config row (for display) or a specific provider/model pair (for the
// settings form's "already saved?" check). This only needs a yes/no existence check, used to gate
// creating a new llm-graded catalog before any prompt in it could ever be graded.

import type { SupabaseClient } from './sessionQueries';

/**
 * Whether an instructor has ever saved an LLM provider config (any row in instructor_llm_config
 * for this user_id). is_active is irrelevant here: it's a *global* flag
 * (uq_instructor_llm_config_one_active) for which single config grading currently prefers across
 * the whole app, not a per-instructor "do I have one at all" signal — POST /api/instructor/llm-config
 * ensures a row is only ever inserted once id and key are both present, so "a row exists" is
 * exactly "a key is saved" (see lib/instructorLlmConfigClient.ts's toInstructorLlmConfig).
 */
export async function hasLlmConfig(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ hasConfig: boolean; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('instructor_llm_config')
    .select('instructor_llm_config_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) return { hasConfig: false, error };
  return { hasConfig: data !== null, error: null };
}
