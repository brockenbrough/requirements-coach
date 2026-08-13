// REQ-DL-1.1 / REQ-DL-3.1: activity_type identifies which quiz a question, session, or title
// belongs to.
//
// GitHub #347: this used to be a compile-time union of the three built-in quizzes (see git
// history for the old ACTIVITY_TYPES array) — that stopped being true once instructors could
// create their own quizzes at runtime via POST /api/activities/types. "Is this a known activity
// type" can now only be answered by asking the activity_type table, which is what isActivityType
// below does. Every route that used to check a value against the old array now awaits this
// instead; see the six-plus call sites listed in the PR/commit that introduced this file's
// current shape for the full list.
//
// ActivityType is kept as a type alias (not a literal union) purely so existing `: ActivityType`
// annotations across the codebase keep compiling — it carries no compile-time restriction of its
// own any more.
export type ActivityType = string;

import type { SupabaseClient } from './sessionQueries';

/**
 * True if `value` is a real key in the activity_type table — a built-in quiz or one an
 * instructor created. Replaces the old synchronous, hardcoded check; every call site now needs
 * a Supabase client and an await.
 *
 * error is only set on an actual database failure (distinct from "not found", which is a normal
 * `{ valid: false, error: null }`) so callers can tell "400: unknown activity type" apart from
 * "500: could not check".
 */
export async function isActivityType(
  supabase: SupabaseClient,
  value: unknown,
): Promise<{ valid: boolean; error: { message: string } | null }> {
  if (typeof value !== 'string' || value.trim() === '') return { valid: false, error: null };

  const { data, error } = await supabase
    .from('activity_type')
    .select('activity_type')
    .eq('activity_type', value)
    .maybeSingle();

  if (error) return { valid: false, error };
  return { valid: data !== null, error: null };
}

/**
 * Derives the activity_type key POST /api/activities/types stores from the quiz's display name:
 * upper-cased, every run of non-alphanumeric characters collapsed to a single underscore, no
 * leading/trailing underscore. Matches the format of the three built-in keys exactly —
 * slugifyQuizName('Identify Weak User Stories') === 'IDENTIFY_WEAK_USER_STORIES' — so a
 * custom quiz's key looks like it always belonged next to the built-in ones.
 */
export function slugifyQuizName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
