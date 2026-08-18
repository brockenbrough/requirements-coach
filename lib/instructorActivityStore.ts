// Local cache for the class-wide activity list (GET /api/instructor/activities, GitHub #176).
// Same shape as instructorStudentsStore: versioned key, SSR-guarded read/write, only typed
// getter/setter exported — no raw store object.
//
// v2: the cached value grew a second field, ownedActivityTypes (GitHub #171 follow-up — the
// Instructor Dashboard's stat cards need the instructor's full owned-catalog list, not just the
// sessions derived from it), so the key bumped from v1 to v2 rather than reshaping the old one —
// an old v1 value under the old key is simply never read again instead of being misread as the
// new shape.
//
// v3: each session in `sessions` grew a `courses` field (GitHub #474). Same reasoning as v1->v2 —
// a stale v2 entry has no `courses` on its sessions at all, and reshaping it in place would have
// every existing cached row silently read as "no course assigned" until the next forced refresh,
// which is wrong rather than merely stale. Bumping the key means a v2 entry is simply never read
// again; the next load is a real fetch that gets the field for free.
//
// Keyed by the instructor's user_id so a shared browser does not hand one instructor's cache
// to the next. Cleared on logout alongside every other cache that holds students' personal data.
import type { InstructorActivityEntry } from './sessionTypes';
import type { OwnedActivityTypeSummary } from './activityTypeQueries';

const STORAGE_KEY = 'rc_instructor_activity_v3';

type CachedInstructorActivity = {
  sessions: InstructorActivityEntry[];
  ownedActivityTypes: OwnedActivityTypeSummary[];
};

type InstructorActivityStore = Partial<Record<string, CachedInstructorActivity>>;

function readStore(): InstructorActivityStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as InstructorActivityStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: InstructorActivityStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/**
 * Guards against a malformed entry under this key — not just unparseable JSON (readStore's
 * try/catch already covers that), but a value that parses fine and is still the wrong shape, e.g.
 * written by a build from before ownedActivityTypes existed. localStorage is plain, untyped
 * client state; nothing stops a stale write, a hand-edited value, or a future shape change from
 * landing here looking valid to JSON.parse but wrong to every reader. A caller that trusted this
 * blindly would crash on `.sessions.map(...)` the moment the shape didn't match.
 */
function isCachedInstructorActivity(value: unknown): value is CachedInstructorActivity {
  const candidate = value as Partial<CachedInstructorActivity> | null | undefined;
  return Array.isArray(candidate?.sessions) && Array.isArray(candidate?.ownedActivityTypes);
}

export function getCachedInstructorActivities(instructorId: string): CachedInstructorActivity | null {
  const store = readStore();
  const cached = store[instructorId];
  return isCachedInstructorActivity(cached) ? cached : null;
}

export function setCachedInstructorActivities(instructorId: string, data: CachedInstructorActivity): void {
  const store = readStore();
  store[instructorId] = data;
  writeStore(store);
}

/** Drops every entry, for every instructor — see lib/clientCaches.ts. */
export function clearCachedInstructorActivities(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
