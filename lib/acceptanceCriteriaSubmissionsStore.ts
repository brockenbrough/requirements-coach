// Local cache for a student's acceptance-criteria submission history
// (GET /api/instructor/students/{id}/acceptance-criteria/submissions, GitHub #153).
// Same shape as activityLogStore.ts: versioned key, SSR-guarded read/write, only typed
// getter/setter exported — no raw store object.
//
// Keyed by studentId so switching students in the Review page is a cache hit after first visit.
// No invalidation is needed on the instructor side: grading happens once from the student's
// submission flow and the row is then read-only until a future "retry grading" story.
import type { SubmissionEntry } from './sessionClient';

const STORAGE_KEY = 'rc_ac_submissions_v1';

type AcceptanceCriteriaSubmissionsStore = Partial<Record<string, SubmissionEntry[]>>;

function readStore(): AcceptanceCriteriaSubmissionsStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AcceptanceCriteriaSubmissionsStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: AcceptanceCriteriaSubmissionsStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getCachedAcceptanceCriteriaSubmissions(studentId: string): SubmissionEntry[] | null {
  const store = readStore();
  return store[studentId] ?? null;
}

export function setCachedAcceptanceCriteriaSubmissions(studentId: string, submissions: SubmissionEntry[]): void {
  const store = readStore();
  store[studentId] = submissions;
  writeStore(store);
}
