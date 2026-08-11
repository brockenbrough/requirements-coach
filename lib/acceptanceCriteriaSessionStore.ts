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
 * The in-progress session, if one exists — null both when there's none stored and when a
 * stored session turns out to already be fully answered (a stale leftover from a session that
 * finished without going through clearSession — e.g. a closed tab). A "resume" prompt with
 * nothing left to answer would be a dead end, so this is treated the same as "no session".
 */
export function getInProgressSession(): AcceptanceCriteriaSession | null {
  const session = readRaw();
  if (!session || isSessionComplete(session)) return null;
  return session;
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
