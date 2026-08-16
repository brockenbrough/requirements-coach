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

export const STORIES_PER_SESSION = 4;

/** The LLM rates each submission 1-10 (see lib/llm's rateAcceptanceCriteria contract). */
export const STORY_MAX_SCORE = 10;

/** session_log.max_score for a Write Acceptance Criteria session — 4 stories x 10 each. */
export const SESSION_MAX_SCORE = STORIES_PER_SESSION * STORY_MAX_SCORE;

/** Per-prompt pass bar shown in the UI (AcceptanceCriteriaFeedbackScreen/SessionSummaryScreen) — not the same threshold as session_log.passed, which uses sessionRules' PASS_RATIO against SESSION_MAX_SCORE. */
export const PROMPT_PASS_SCORE = 8;
