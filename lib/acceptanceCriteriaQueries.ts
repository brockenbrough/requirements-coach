// Queries for the Write Acceptance Criteria activity's real backend session, mirroring
// lib/sessionQueries.ts's role for Type A. Built on session_log + session_to_user_story +
// submission.session_id (supabase/schema.sql's own documented direction for this activity) —
// not the abandoned ac_session/ac_session_story tables, which never existed in the schema.

import {
  findInProgressSession,
  nextUnansweredPosition,
  type SessionPosition,
  type SupabaseClient,
} from './sessionQueries';
import type { UserStoryPrompt } from './acceptanceCriteriaTypes';

export type SessionStorySlot = { position: number } & UserStoryPrompt;

const SESSION_STORY_COLUMNS = `
  position,
  story:user_story_id ( user_story_id, story_text )
`;

type StoryRow = {
  position: number;
  story: { user_story_id: string; story_text: string } | null;
};

/** The session's drawn stories in presentation order — the AC equivalent of loadSessionQuestions. */
export async function loadSessionStories(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('session_to_user_story')
    .select(SESSION_STORY_COLUMNS)
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (error) return { stories: null, error };

  const stories: SessionStorySlot[] = ((data ?? []) as unknown as StoryRow[])
    .filter((row) => row.story !== null)
    .map((row) => ({
      position: row.position,
      userStoryId: row.story!.user_story_id,
      description: row.story!.story_text,
    }));

  return { stories, error: null };
}

export type SessionSubmissionEntry = {
  submissionId: string;
  userStoryId: string;
  submittedText: string;
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
};

const SESSION_SUBMISSION_COLUMNS =
  'submission_id, user_story_id, submitted_text, llm_score, llm_feedback, submitted_at, graded_at';

type SubmissionRow = {
  submission_id: string;
  user_story_id: string;
  submitted_text: string;
  llm_score: number | null;
  llm_feedback: string | null;
  submitted_at: string;
  graded_at: string | null;
};

/** Submissions already made in this session — the AC equivalent of loadSessionAnswers. */
export async function loadSessionSubmissions(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('submission')
    .select(SESSION_SUBMISSION_COLUMNS)
    .eq('session_id', sessionId);

  if (error) return { submissions: null, error };

  const submissions: SessionSubmissionEntry[] = ((data ?? []) as unknown as SubmissionRow[]).map((row) => ({
    submissionId: row.submission_id,
    userStoryId: row.user_story_id,
    submittedText: row.submitted_text,
    score: row.llm_score,
    feedback: row.llm_feedback,
    submittedAt: row.submitted_at,
    gradedAt: row.graded_at,
  }));

  return { submissions, error: null };
}

/**
 * The position of the next story the student hasn't submitted yet, or null once every drawn
 * story has a submission. Delegates to nextUnansweredPosition (lib/sessionQueries.ts) instead of
 * reimplementing "lowest position without a match" — same derived-not-stored reasoning as Type
 * A's current-question pointer, with user_story_id standing in for question_id.
 */
export function nextUnansweredStoryPosition(
  stories: SessionStorySlot[],
  submittedUserStoryIds: Set<string>,
): number | null {
  const positions: SessionPosition[] = stories.map((story) => ({
    position: story.position,
    question_id: story.userStoryId,
  }));
  return nextUnansweredPosition(positions, submittedUserStoryIds);
}

/** The student's running Write Acceptance Criteria session, or null — thin wrapper so callers
 * don't repeat the activity_type literal. */
export function findInProgressAcSession(supabase: SupabaseClient, userId: string) {
  return findInProgressSession(supabase, userId, 'WRITE_ACCEPTANCE_CRITERIA');
}
