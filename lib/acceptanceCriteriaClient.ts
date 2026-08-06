'use client';

// GitHub #149: client for the "Write Acceptance Criteria" activity (REQ-FU-2).
//
// No real backend route exists for this yet — app/api has nothing under user-story/ or
// submissions/, unlike the Type A flow lib/sessionClient.ts talks to. supabase/schema.sql
// already defines the tables this would read and write (user_story, submission,
// instructor_llm_config), so the shapes below are deliberately modeled on those columns —
// see lib/acceptanceCriteriaTypes.ts. Swapping the mock functions below for real fetch calls
// against real routes is the only change a real backend integration needs; every component
// built against ApiResult<T> stays the same.
//
// Still missing for a real backend:
//   - GET  /api/user-story                              → draw one random user_story row
//   - POST /api/user-story/{userStoryId}/submissions     → insert a submission row, run LLM
//     grading (using an instructor's configured provider/key from instructor_llm_config),
//     and return the graded result — "write before disclose" (CLAUDE.md), same as
//     POST .../answers: the submission should be committed before llm_score/llm_feedback
//     are computed and returned, not held in memory only to be lost on a failed request.
//   - Auth/ownership: submission.user_id must come from the token, exactly like every other
//     route in this app — never from the request body.

import type { AcceptanceCriteriaResult, UserStoryPrompt } from './acceptanceCriteriaTypes';
import { pickRandomUserStory } from './mockUserStories';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const MOCK_DELAY_MS = 500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lets a developer/tester force the 502 branch on demand instead of it being nondeterministic —
 * visit /activities/write-acceptance-criteria?mock502=1 to see the failed-load and
 * failed-submit states, or ?mock502=1&mock502=submit to only fail the submit step.
 * Remove once a real backend route (and real 502s) exists.
 */
function shouldSimulateFailure(step: 'load' | 'submit'): boolean {
  if (typeof window === 'undefined') return false;
  const value = new URLSearchParams(window.location.search).get('mock502');
  if (value === null) return false;
  return value === '1' || value === step;
}

/**
 * Mocks GET .../user-story: draws one random story for the student to write criteria for.
 * Takes `token` (unused for now) so the call site already matches lib/sessionClient.ts's
 * request(url, init, token) convention — swapping this for a real fetch later doesn't change
 * the signature callers use.
 */
export async function loadUserStory(token: string): Promise<ApiResult<{ userStory: UserStoryPrompt }>> {
  void token;
  await delay(MOCK_DELAY_MS);

  if (shouldSimulateFailure('load')) {
    return { ok: false, status: 502, error: 'The writing prompt service is temporarily unavailable.' };
  }

  return { ok: true, data: { userStory: pickRandomUserStory() } };
}

/** Mocks POST .../submissions: commits the answer, then returns the LLM's grading of it. */
export async function submitAcceptanceCriteria(
  token: string,
  userStoryId: string,
  submittedText: string,
): Promise<ApiResult<{ result: AcceptanceCriteriaResult }>> {
  void token;
  await delay(MOCK_DELAY_MS);

  if (shouldSimulateFailure('submit')) {
    return { ok: false, status: 502, error: 'Grading is temporarily unavailable. Your answer was not lost — try submitting again.' };
  }

  return {
    ok: true,
    data: {
      result: {
        submission_id: `mock-submission-${Date.now()}`,
        user_story_id: userStoryId,
        submitted_text: submittedText,
        llm_score: 78,
        llm_feedback:
          'Good start — your criteria cover the main success path and are phrased as Given/When/Then. To strengthen them: add a criterion for what happens on the failure/empty case, and make sure each one names an observable outcome rather than a general impression (e.g. avoid words like "properly" or "correctly" on their own).',
      },
    },
  };
}
