import type { ActivityType } from './activityTypes';

/**
 * GitHub #149: types for the "Write Acceptance Criteria" activity (REQ-FU-2) — a free-text,
 * LLM-graded activity, structurally distinct from the Type A question-bank activities in
 * lib/activityContent.ts (no fixed answer options, no session_log/session_to_question).
 *
 * Field names match what the real routes return, not the user_story/submission column names:
 * GET .../user-story (app/api/activities/write-acceptance-criteria/user-story/route.ts) and
 * POST .../submissions (app/api/activities/write-acceptance-criteria/submissions/route.ts).
 */
export type UserStoryPrompt = {
  userStoryId: string;
  /** user_story.story_text, as the GET route renames it — there is no title column yet. */
  description: string;
};

/** What POST .../submissions returns once the LLM has graded the submission. */
export type AcceptanceCriteriaResult = {
  submissionId: string;
  /** Not echoed back by the route — the client carries forward what the student typed. */
  submittedText: string;
  /** 1-10, this activity's own scale — see lib/llm/promptUtils.ts, separate from the Type A quiz's 100-point session score. */
  score: number;
  feedback: string;
};

/**
 * One user_story row owned by the calling instructor, as returned by
 * GET /api/instructor/user-stories (GitHub #225). Deliberately not UserStoryPrompt — that type
 * is tied to the student-facing random-draw routes (its doc comment says so explicitly) and
 * has no difficultyLevel/activityType; this one is instructor-facing and scoped by creator_id.
 */
export type InstructorUserStoryEntry = {
  id: string;
  storyText: string;
  difficultyLevel: 1 | 2 | 3;
  activityType: ActivityType;
};
