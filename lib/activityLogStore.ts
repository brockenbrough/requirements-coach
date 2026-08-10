// Local cache for the student's full activity log (GET /api/students/{id}/activities), so the
// dashboard/log page (GitHub #48) doesn't have to hit the network on every mount. Same shape as
// lib/scoreStore.ts and lib/completedSessionsStore.ts: a versioned key, an SSR-guarded
// read/write pair, and only typed getter/setter functions exported — never the raw store.
//
// Unlike those two, this list includes in-progress and abandoned sessions, whose progress
// changes as soon as the student answers a question or starts/abandons an activity elsewhere —
// callers need to forceRefresh at those points too, not only when a session completes.
import type { SessionListEntry } from './sessionClient';

const STORAGE_KEY = 'rc_activity_log_v1';

type ActivityLogStore = Partial<Record<string, SessionListEntry[]>>;

function readStore(): ActivityLogStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActivityLogStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: ActivityLogStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getCachedActivityLog(studentId: string): SessionListEntry[] | null {
  const store = readStore();
  return store[studentId] ?? null;
}

export function setCachedActivityLog(studentId: string, activities: SessionListEntry[]): void {
  const store = readStore();
  store[studentId] = activities;
  writeStore(store);
}

/** Drops every entry, for every student — see lib/clientCaches.ts. */
export function clearCachedActivityLog(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
