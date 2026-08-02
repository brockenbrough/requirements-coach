// Local cache for the student's cumulative score (GET /api/students/{id}/score), so
// AppShell doesn't have to hit the network on every page navigation. Same shape as
// lib/activityStore.ts's storage helpers: a versioned key, an SSR-guarded read/write pair,
// and only typed getter/setter functions exported — never the raw store.
const STORAGE_KEY = 'rc_score_v1';

type ScoreStore = Partial<Record<string, number>>;

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

export function getCachedScore(studentId: string): number | null {
  const store = readStore();
  return store[studentId] ?? null;
}

export function setCachedScore(studentId: string, score: number): void {
  const store = readStore();
  store[studentId] = score;
  writeStore(store);
}
