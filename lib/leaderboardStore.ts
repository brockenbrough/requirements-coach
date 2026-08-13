// Local cache for a course leaderboard (GET /api/courses/{courseId}/leaderboard). Same shape as
// the other client-side caches (see CLAUDE.md's "Client-side caching"): a versioned key, an
// SSR-guarded read/write pair, and only typed getter/setter functions exported — never the raw
// store. Keyed by courseId, the same way completedAttemptsStore is keyed by activityType.
//
// Holds other students' usernames and photos, exactly why instructorStudentsStore is cleared on
// logout — clearCachedLeaderboard is registered in lib/clientCaches.ts for the same reason.
//
// Deliberately sessionStorage, not localStorage (GitHub #329): unlike the other eight caches in
// CLAUDE.md's "Client-side caching" list, a stale leaderboard entry must not survive an app
// restart — reopening the tab always gets exactly one fresh fetch, since sessionStorage starts
// empty for a new tab/window regardless of what a previous session left behind.
import type { LeaderboardEntry } from './leaderboardTypes';

const STORAGE_KEY = 'rc_leaderboard_v1';

type LeaderboardStore = Partial<Record<string, LeaderboardEntry[]>>;

function readStore(): LeaderboardStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LeaderboardStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: LeaderboardStore) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getCachedLeaderboard(courseId: string): LeaderboardEntry[] | null {
  const store = readStore();
  return store[courseId] ?? null;
}

export function setCachedLeaderboard(courseId: string, entries: LeaderboardEntry[]): void {
  const store = readStore();
  store[courseId] = entries;
  writeStore(store);
}

/**
 * Drops every course's cached leaderboard. Used both for logout (see lib/clientCaches.ts) and as
 * the invalidation the play page triggers when a session completes: the student's own score just
 * changed, and that can move their rank on any course leaderboard they're in, so the whole cache
 * is cleared rather than trying to guess which course(s) to target.
 */
export function clearCachedLeaderboard(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
