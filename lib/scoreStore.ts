// Local cache for the student's cumulative score (GET /api/students/{id}/score), so
// AppShell doesn't have to hit the network on every page navigation. Same shape as
// lib/activityStore.ts's storage helpers: a versioned key, an SSR-guarded read/write pair,
// and only typed getter/setter functions exported — never the raw store.
//
// GitHub #39: bumped v1 -> v2 when the cached value's shape changed from a plain number to
// { score, sessionsCompleted }. A browser with a pre-existing v1 entry would otherwise have
// getCachedScore() return that raw number *typed* as CachedScore, so `result.data.score` reads
// as undefined and AppShell's `score.toLocaleString()` throws. The version bump makes readStore()
// simply miss on old data (real number, wrong shape) instead of mis-parsing it.
const STORAGE_KEY = 'rc_score_v2';

/** GitHub #39: sessionsCompleted travels with score so a cache hit still has both fields. */
export type CachedScore = { score: number; sessionsCompleted: number };

type ScoreStore = Partial<Record<string, CachedScore>>;

function readStore(): ScoreStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScoreStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: ScoreStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getCachedScore(studentId: string): CachedScore | null {
  const store = readStore();
  return store[studentId] ?? null;
}

export function setCachedScore(studentId: string, value: CachedScore): void {
  const store = readStore();
  store[studentId] = value;
  writeStore(store);
}

/** Drops every entry, for every student — see lib/clientCaches.ts. */
export function clearCachedScore(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
