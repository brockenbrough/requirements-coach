/**
 * GitHub #149: types for the "Write Acceptance Criteria" activity (REQ-FU-2) — a free-text,
 * LLM-graded activity, structurally distinct from the Type A question-bank activities in
 * lib/activityContent.ts (no fixed answer options, no session_log/session_to_question).
 *
 * Field names mirror supabase/schema.sql's user_story and submission tables (snake_case,
 * same convention SessionQuestion/SessionRecord use in lib/sessionClient.ts) so that once a
 * real GET .../user-story and POST submission route exist, only lib/acceptanceCriteriaClient.ts
 * needs to change — these types and every component built against them stay the same.
 */
export type UserStoryPrompt = {
  user_story_id: string;
  story_text: string;
  difficulty_level: 1 | 2 | 3;
};

/** What POST .../submissions returns once the LLM has graded the submission (submission table). */
export type AcceptanceCriteriaResult = {
  submission_id: string;
  user_story_id: string;
  submitted_text: string;
  /** submission.llm_score — out of 100, matching every other activity's full-score convention. */
  llm_score: number;
  /** submission.llm_feedback — free-text coaching on clarity/testability/connection to the story. */
  llm_feedback: string;
};
