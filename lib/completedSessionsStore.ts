// Local cache for the student's completed-sessions list (GET /api/sessions?status=completed),
// so the dashboard doesn't have to hit the network on every mount. Same shape as
// lib/scoreStore.ts: a versioned key, an SSR-guarded read/write pair, and only typed
// getter/setter functions exported — never the raw store.
import type { SessionListEntry } from './sessionClient';

const STORAGE_KEY = 'rc_completed_sessions_v1';

type CompletedSessionsStore = Partial<Record<string, SessionListEntry[]>>;

function readStore(): CompletedSessionsStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CompletedSessionsStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: CompletedSessionsStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getCachedCompletedSessions(studentId: string): SessionListEntry[] | null {
  const store = readStore();
  return store[studentId] ?? null;
}

export function setCachedCompletedSessions(studentId: string, sessions: SessionListEntry[]): void {
  const store = readStore();
  store[studentId] = sessions;
  writeStore(store);
}
