import type { ActivityType } from './activityTypes';

/**
 * GitHub #149/#379: types for an LLM-graded activity — free-text prompts scored by a model, as
 * opposed to the question-bank activities in lib/activityContent.ts (no fixed answer options, no
 * session_to_question). WRITE_ACCEPTANCE_CRITERIA is the seeded example of one, not the only one.
 *
 * Field names match what the routes return, not the user_story/submission column names.
 */
export type UserStoryPrompt = {
  userStoryId: string;
  /** user_story.story_text, as the GET route renames it — there is no title column yet. */
  description: string;
};

/** What POST .../submissions returns once the LLM has graded the submission. */
export type LlmGradingResult = {
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

/**
 * One prompt in an LLM-graded catalog, any author, as the catalog detail page shows it
 * (GitHub #379) — the free-text counterpart to CatalogQuestion in lib/quizQuestionTypes.ts.
 *
 * A third type rather than a reuse of InstructorUserStoryEntry above, for the same reason
 * CatalogQuestion is a separate type from QuizQuestion: that one is scoped to rows the caller
 * authored, so it has no need to say who owns each row. This one deliberately returns every
 * prompt in the catalog regardless of author, which is exactly what makes `ownerId` necessary —
 * it's what lets the page decide whose rows get Edit/Delete without a second round trip.
 */
export type CatalogUserStory = {
  id: string;
  activityType: ActivityType;
  level: 1 | 2 | 3;
  storyText: string;
  ownerId: string | null;
};
