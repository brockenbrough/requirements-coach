// Local cache for the student's per-activity completed-attempts list (GET
// /api/sessions/completed?activityType=...), so the activity detail page doesn't have to hit
// the network on every mount. Same shape as lib/scoreStore.ts / lib/completedSessionsStore.ts:
// a versioned key, an SSR-guarded read/write pair, and only typed getter/setter functions
// exported — never the raw store. Keyed by studentId *and* activityType (unlike those two),
// since each activity type has its own list of finished attempts.
import type { ActivityType } from './activityTypes';
import type { CompletedAttempt } from './sessionClient';

// Bumped to v2: loadCompletedAttempts now stores completedAt already normalized to a real
// instant (lib/dateTime.ts), so v1 entries hold the old zone-less form and would keep rendering
// an hour or two off until something happened to force a refresh. This is what the version in
// the key is for — the stale entries are simply never read again.
//
// Bumped to v3 (GitHub #583): cacheKey grew a third segment (assembledQuizId), so a v2 key
// (`studentId:activityType`) would never match a v3 lookup (`studentId:activityType:none`) even
// for the identical data — rather than leave v2 entries silently unreadable forever under the
// same key, the whole store starts fresh, same as the v1 -> v2 migration.
const STORAGE_KEY = 'rc_completed_attempts_v3';

type CompletedAttemptsStore = Partial<Record<string, CompletedAttempt[]>>;

// GitHub #583: assembledQuizId disambiguates two quizzes sharing a catalog, so their completed-
// attempt histories don't overwrite each other in the cache. Omitted -> the exact pre-#583 key,
// for a caller that doesn't know a specific quiz (a bare/bookmarked link).
function cacheKey(studentId: string, activityType: ActivityType, assembledQuizId?: string): string {
  return `${studentId}:${activityType}:${assembledQuizId ?? 'none'}`;
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

export function getCachedCompletedAttempts(
  studentId: string,
  activityType: ActivityType,
  assembledQuizId?: string,
): CompletedAttempt[] | null {
  const store = readStore();
  return store[cacheKey(studentId, activityType, assembledQuizId)] ?? null;
}

export function setCachedCompletedAttempts(
  studentId: string,
  activityType: ActivityType,
  attempts: CompletedAttempt[],
  assembledQuizId?: string,
): void {
  const store = readStore();
  store[cacheKey(studentId, activityType, assembledQuizId)] = attempts;
  writeStore(store);
}

/** Drops every entry, for every student and activity type — see lib/clientCaches.ts. */
export function clearCachedCompletedAttempts(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
