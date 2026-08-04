// Local cache for the student's per-activity completed-attempts list (GET
// /api/sessions/completed?activityType=...), so the activity detail page doesn't have to hit
// the network on every mount. Same shape as lib/scoreStore.ts / lib/completedSessionsStore.ts:
// a versioned key, an SSR-guarded read/write pair, and only typed getter/setter functions
// exported — never the raw store. Keyed by studentId *and* activityType (unlike those two),
// since each activity type has its own list of finished attempts.
import type { ActivityType } from './activityTypes';
import type { CompletedAttempt } from './sessionClient';

const STORAGE_KEY = 'rc_completed_attempts_v1';

type CompletedAttemptsStore = Partial<Record<string, CompletedAttempt[]>>;

function cacheKey(studentId: string, activityType: ActivityType): string {
  return `${studentId}:${activityType}`;
}

function readStore(): CompletedAttemptsStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CompletedAttemptsStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: CompletedAttemptsStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getCachedCompletedAttempts(studentId: string, activityType: ActivityType): CompletedAttempt[] | null {
  const store = readStore();
  return store[cacheKey(studentId, activityType)] ?? null;
}

export function setCachedCompletedAttempts(
  studentId: string,
  activityType: ActivityType,
  attempts: CompletedAttempt[],
): void {
  const store = readStore();
  store[cacheKey(studentId, activityType)] = attempts;
  writeStore(store);
}
