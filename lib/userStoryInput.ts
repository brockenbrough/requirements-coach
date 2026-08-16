// GitHub #379: the body validation POST /api/instructor/user-stories and PATCH
// /api/instructor/user-stories/{userStoryId} both apply to a prompt.
//
// It lives here rather than in either route because a Next.js route.ts may only export HTTP method
// handlers — there is no way for one route file to share a helper with another. The MCQ routes
// duplicate their equivalent block between POST and PATCH for exactly that reason; this pair does
// not, because the "must be an llm-graded activity_type" rule is the load-bearing one and having
// two copies of it is how the two routes would eventually disagree about what a prompt may attach
// to.

import { getGradingKind } from './activityTypes';
import type { SupabaseClient } from './sessionQueries';

export type ValidatedUserStoryInput = {
  ok: true;
  storyText: string;
  activityType: string;
  difficultyLevel: 1 | 2 | 3;
};

export type UserStoryInputRejection = { ok: false; response: Response };

/**
 * Validates and normalises a prompt body, returning either the trimmed values or the exact
 * Response to send back.
 *
 * Order matters: shape checks first (they need no query), then the activity_type lookup, then the
 * level. The activityType string narrowing is a separate step from the lookup for the same reason
 * the questions routes split theirs — getGradingKind is async and so can't double as a type
 * predicate the way a synchronous array check could.
 *
 * A valid key whose grading_kind is 'mcq' is a 400, not a 404: the catalog exists, it just cannot
 * hold prompts. Nothing would ever read a prompt attached to an MCQ catalog (the MCQ draw queries
 * `question`), so storing one would be a silent no-op rather than an error the instructor could
 * see. supabase/schema.sql notes this invariant can't be expressed in Postgres — this is where it
 * is enforced instead.
 */
export async function validateUserStoryInput(
  supabase: SupabaseClient,
  input: { storyText?: unknown; activityType?: unknown; difficultyLevel?: unknown },
): Promise<ValidatedUserStoryInput | UserStoryInputRejection> {
  const { storyText, activityType, difficultyLevel } = input;

  if (typeof storyText !== 'string' || storyText.trim() === '') {
    return { ok: false, response: Response.json({ error: 'storyText is required.' }, { status: 400 }) };
  }

  if (typeof activityType !== 'string') {
    return {
      ok: false,
      response: Response.json({ error: 'activityType must be a valid activity type.' }, { status: 400 }),
    };
  }

  const { gradingKind, error } = await getGradingKind(supabase, activityType);
  if (error) return { ok: false, response: Response.json({ error: error.message }, { status: 500 }) };
  if (gradingKind === null) {
    return {
      ok: false,
      response: Response.json({ error: 'activityType must be a valid activity type.' }, { status: 400 }),
    };
  }
  if (gradingKind !== 'llm-graded') {
    return {
      ok: false,
      response: Response.json(
        { error: 'Prompts can only be added to an LLM-graded activity.' },
        { status: 400 },
      ),
    };
  }

  if (difficultyLevel !== 1 && difficultyLevel !== 2 && difficultyLevel !== 3) {
    return {
      ok: false,
      response: Response.json({ error: 'difficultyLevel must be 1, 2, or 3.' }, { status: 400 }),
    };
  }

  return { ok: true, storyText: storyText.trim(), activityType, difficultyLevel };
}
