// Shared rules for every LLM-graded activity, mirroring lib/sessionRules.ts's role for the MCQ
// flow — so the session and submissions routes cannot drift apart. Replaces lib/acSessionConfig.ts,
// which belonged to the abandoned ac_session/ac_session_story design (those tables never existed
// in supabase/schema.sql — see session_to_user_story instead).
//
// GitHub #379 renamed this file from acceptanceCriteria* to llmActivity*: nothing here was ever
// specific to acceptance criteria, and it is about to serve every instructor-created LLM-graded
// activity, not just the one seeded example. lib/acceptanceCriteriaSubmissionsStore.ts and the
// /api/instructor/acceptance-criteria/* route paths deliberately keep their old names — those are
// instructor-dashboard surfaces this issue does not restructure, and renaming a route path is a
// separate, riskier change.

import type { Difficulty } from './activityContent';

export const STORIES_PER_SESSION = 4;

/** The LLM rates each submission 1-10 (see lib/llm's rateAcceptanceCriteria contract). This is
 *  the raw quality rating — feedback, the PROMPT_PASS_SCORE bar, and the instructor statistics
 *  histogram all stay on this scale. It is a separate concept from the difficulty-scaled
 *  gamification award below (see awardedScoreForRating). */
export const STORY_MAX_SCORE = 10;

/**
 * Gamification points for a fully-correct (10/10) LLM-graded submission, by difficulty
 * (Easy/Medium/Hard) — the free-text counterpart to sessionRules' MCQ_POINTS_BY_DIFFICULTY.
 * Deliberately not what submission.llm_score stores: llm_score stays the raw 1-10 rating so
 * per-prompt feedback, the PROMPT_PASS_SCORE bar, and lib/llmActivityStatisticsQueries.ts's 1-10
 * histogram keep working unchanged. The scaled award lives in submission.awarded_score instead
 * (see supabase/schema.sql's trg_submission_score) — "how many points did this earn" is a
 * different question from "how good was it", even though one derives from the other.
 */
export const LLM_POINTS_BY_DIFFICULTY: Record<Difficulty, number> = { 1: 20, 2: 40, 3: 60 };

export function llmPointsForDifficulty(level: Difficulty): number {
  return LLM_POINTS_BY_DIFFICULTY[level];
}

/**
 * session_log.max_score for an LLM-graded session at this difficulty — STORIES_PER_SESSION
 * prompts, each worth llmPointsForDifficulty(level). Replaces the old flat SESSION_MAX_SCORE now
 * that the award scales with level instead of always being STORY_MAX_SCORE per story.
 */
export function sessionMaxScoreForDifficulty(level: Difficulty): number {
  return STORIES_PER_SESSION * llmPointsForDifficulty(level);
}

/**
 * Scales the LLM's raw 1-10 rating proportionally onto this difficulty's point scale — a 7/10 on
 * a Medium (level 2) prompt earns round(7/10 * 40) = 28 points. This is what POST
 * .../llm/submissions writes to submission.awarded_score.
 */
export function awardedScoreForRating(rating: number, level: Difficulty): number {
  return Math.round((rating / STORY_MAX_SCORE) * llmPointsForDifficulty(level));
}

/** Per-prompt pass bar shown in the UI (AcceptanceCriteriaFeedbackScreen/SessionSummaryScreen) — not the same threshold as session_log.passed, which uses sessionRules' PASS_RATIO against the session's own max_score. Compared against the raw 1-10 rating (submission.llm_score), not the scaled award. */
export const PROMPT_PASS_SCORE = 8;
