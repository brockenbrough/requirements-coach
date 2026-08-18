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
 * The two grading paths an activity_type can take, mirroring ck_activity_type_grading_kind in
 * supabase/schema.sql. 'mcq' draws from question/answer and scores in the database;
 * 'llm-graded' draws from user_story and scores through instructor_llm_config's provider.
 */
export const GRADING_KINDS = ['mcq', 'llm-graded'] as const;
export type GradingKind = (typeof GRADING_KINDS)[number];

export function isGradingKind(value: unknown): value is GradingKind {
  return typeof value === 'string' && (GRADING_KINDS as readonly string[]).includes(value);
}

/**
 * The activity_type row's grading_kind, or null when the key matches no row — so this answers
 * both "does this activity type exist" and "which grading path does it take" in one round trip,
 * and subsumes isActivityType for any caller that needs the second answer anyway.
 *
 * isActivityType is deliberately left alone rather than reimplemented on top of this: every
 * existing route test mocks its exact .select('activity_type') chain, and the MCQ paths have no
 * use for the kind. New LLM-graded routes call this instead.
 *
 * Same error split as isActivityType — error is only set on a real database failure, so a caller
 * can tell "400: unknown activity type" (gradingKind null, error null) apart from "500: could not
 * check". A row whose grading_kind somehow isn't one of GRADING_KINDS is reported as null too:
 * the CHECK constraint makes that unreachable through Postgres, and treating an unrecognised
 * value as "unknown activity" is the safe direction — it refuses the request rather than guessing
 * a grading path.
 */
export async function getGradingKind(
  supabase: SupabaseClient,
  activityType: unknown,
): Promise<{ gradingKind: GradingKind | null; error: { message: string } | null }> {
  if (typeof activityType !== 'string' || activityType.trim() === '') {
    return { gradingKind: null, error: null };
  }

  const { data, error } = await supabase
    .from('activity_type')
    .select('grading_kind')
    .eq('activity_type', activityType)
    .maybeSingle();

  if (error) return { gradingKind: null, error };

  const kind = (data as { grading_kind?: unknown } | null)?.grading_kind;
  return { gradingKind: isGradingKind(kind) ? kind : null, error: null };
}

/**
 * activity_type.rating_prompt's length bound (see supabase/schema.sql) — shared by the create
 * route (POST /api/activities/types) and the edit route (PATCH
 * /api/instructor/quizzes/{activityType}) so the two caps can't drift apart. Same reasoning as
 * MAX_SUBMITTED_TEXT_LENGTH in the llm/submissions route: unlike description (display-only), this
 * text is re-sent to the LLM on every graded submission against this catalog, so it needs a
 * token-cost bound, not just a UX one.
 */
export const MAX_RATING_PROMPT_LENGTH = 4000;

export type RatingPromptValidation =
  | { ok: true; ratingPrompt: string }
  | { ok: false; response: Response };

/**
 * Validates a rating-prompt request-body field, trimmed — required non-blank, capped at
 * MAX_RATING_PROMPT_LENGTH. Shared by the create and edit routes above so their error responses
 * (and the length they enforce) can't say different things for the same rule.
 */
export function validateRatingPromptText(value: unknown): RatingPromptValidation {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, response: Response.json({ error: 'ratingPrompt is required.' }, { status: 400 }) };
  }

  const trimmed = value.trim();
  if (trimmed.length > MAX_RATING_PROMPT_LENGTH) {
    return {
      ok: false,
      response: Response.json(
        { error: `ratingPrompt must be ${MAX_RATING_PROMPT_LENGTH} characters or fewer.` },
        { status: 400 },
      ),
    };
  }

  return { ok: true, ratingPrompt: trimmed };
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

// Matches activity_type.activity_type varchar(50) in supabase/schema.sql. Shared by every route
// that derives a key from an instructor-given name (POST /api/activities/types, POST
// /api/instructor/quizzes/{activityType}/duplicate) so the two can't drift on how long a name is
// allowed to be.
export const MAX_ACTIVITY_TYPE_KEY_LENGTH = 50;

export type ActivityTypeKeyValidation = { ok: true; key: string } | { ok: false; response: Response };

/**
 * slugifyQuizName plus the two failure modes every caller that derives a key from a name has to
 * check: an empty result (a name with no letters or digits at all) and a key too long for the
 * column. Extracted for GitHub #478's duplicate-catalog route, which needs the exact same checks
 * POST /api/activities/types already made inline.
 */
export function deriveActivityTypeKey(name: string): ActivityTypeKeyValidation {
  const key = slugifyQuizName(name);

  if (key === '') {
    return { ok: false, response: Response.json({ error: 'name must contain at least one letter or number.' }, { status: 400 }) };
  }
  if (key.length > MAX_ACTIVITY_TYPE_KEY_LENGTH) {
    return {
      ok: false,
      response: Response.json(
        { error: `name is too long — the derived key must be ${MAX_ACTIVITY_TYPE_KEY_LENGTH} characters or fewer.` },
        { status: 400 },
      ),
    };
  }

  return { ok: true, key };
}
