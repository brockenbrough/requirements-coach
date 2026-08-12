import type { AcceptanceCriteriaResult, UserStoryPrompt } from './acceptanceCriteriaTypes';

/**
 * GitHub #260: local "session" grouping for the Write Acceptance Criteria activity, so a
 * student can be offered Resume/Abandon the same way Type A activities already are (REQ-PL-6.3,
 * GitHub #20) — see this file's docstring on why this has to be a local mock rather than a real
 * session, and app/activities/write-acceptance-criteria/page.tsx for how it's used.
 *
 * Mock persistence, same role as lib/activityStore.ts before Type A got a real backend: nothing
 * server-side groups a run of write-acceptance-criteria submissions into one 4-story attempt —
 * `submission` (supabase/schema.sql) has no session_id, and GET .../user-story draws one random
 * story per call with no memory of what's already been drawn. This module stands in for that
 * missing grouping entirely client-side. Swapping it out for a real backend later means
 * replacing every function body below with real session_log/session_to_question-style calls,
 * while keeping the same signatures — same promise lib/activityStore.ts's own header makes.
 */
export const STORIES_PER_SESSION = 4;

/** 8/10 is this activity's own pass bar — see AcceptanceCriteriaFeedbackScreen's comment. */
export const AC_PASS_SCORE = 8;

const STORAGE_KEY = 'rc_ac_writing_session_v1';

export type SessionStorySlot = {
  userStoryId: string;
  description: string;
  /** Null until this story has been submitted and graded. */
  result: AcceptanceCriteriaResult | null;
};

export type AcceptanceCriteriaSession = {
  stories: SessionStorySlot[];
  startedAt: string;
};

function readRaw(): AcceptanceCriteriaSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AcceptanceCriteriaSession) : null;
  } catch {
    return null;
  }
}

function write(session: AcceptanceCriteriaSession) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function isSessionComplete(session: AcceptanceCriteriaSession): boolean {
  return session.stories.every((story) => story.result !== null);
}

export function answeredCount(session: AcceptanceCriteriaSession): number {
  return session.stories.filter((story) => story.result !== null).length;
}

/** The index of the first not-yet-answered story, or -1 if the session is already complete. */
export function nextStoryIndex(session: AcceptanceCriteriaSession): number {
  return session.stories.findIndex((story) => story.result === null);
}

/**
 * Whatever session is stored, whether it's still being answered or already complete — null
 * only when nothing is stored at all. The caller (app/activities/write-acceptance-criteria/
 * page.tsx) is the one that decides what a complete session means (show the summary) versus
 * an incomplete one (show the resume/abandon prompt); this function does not discard either.
 *
 * GitHub #263 bug fix: this used to return null for an already-complete session too, treating
 * it as a "stale leftover" (e.g. a closed tab) — safe back when handleContinue cleared the
 * session the instant it became complete, so a complete-and-still-stored session could only
 * mean "abandoned mid-flight". Once #263 started leaving a complete session in storage on
 * purpose (so SessionSummaryScreen has something to show until the student dismisses it), that
 * same "treat complete as stale" logic started discarding sessions that were simply awaiting
 * acknowledgment — any remount while the summary was up (a reload, a background token refresh
 * re-running the mount effect) silently replaced the finished session with a brand new one
 * before the student ever saw their results. A session only ever leaves storage via
 * clearSession() now, called from the student's own "Back to Activities" click — never
 * implicitly by this getter.
 */
export function getStoredSession(): AcceptanceCriteriaSession | null {
  return readRaw();
}

export function startNewSession(stories: UserStoryPrompt[]): AcceptanceCriteriaSession {
  const session: AcceptanceCriteriaSession = {
    stories: stories.map((story) => ({ userStoryId: story.userStoryId, description: story.description, result: null })),
    startedAt: new Date().toISOString(),
  };
  write(session);
  return session;
}

/** Fills in one story's result and persists it — the story stays at its position, no reordering. */
export function recordStoryResult(
  session: AcceptanceCriteriaSession,
  userStoryId: string,
  result: AcceptanceCriteriaResult,
): AcceptanceCriteriaSession {
  const updated: AcceptanceCriteriaSession = {
    ...session,
    stories: session.stories.map((story) => (story.userStoryId === userStoryId ? { ...story, result } : story)),
  };
  write(updated);
  return updated;
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export type SessionSummary = {
  totalScore: number;
  maxScore: number;
  passedCount: number;
  storyCount: number;
};

/**
 * GitHub #263: the whole-session totals for SessionSummaryScreen, derived from the same
 * per-story results this store already tracks — counts only graded stories, so calling this
 * before the session is complete just yields a partial (rather than wrong) total.
 */
export function summarizeSession(session: AcceptanceCriteriaSession): SessionSummary {
  const graded = session.stories.filter(
    (story): story is SessionStorySlot & { result: AcceptanceCriteriaResult } => story.result !== null,
  );

  return {
    totalScore: graded.reduce((sum, story) => sum + story.result.score, 0),
    maxScore: graded.length * 10,
    passedCount: graded.filter((story) => story.result.score >= AC_PASS_SCORE).length,
    storyCount: graded.length,
  };
}
