// Local cache for the class-wide activity list (GET /api/instructor/activities, GitHub #176).
// Same shape as instructorStudentsStore: versioned key, SSR-guarded read/write, only typed
// getter/setter exported — no raw store object.
//
// Keyed by the instructor's user_id so a shared browser does not hand one instructor's cache
// to the next. Cleared on logout alongside every other cache that holds students' personal data.
import type { InstructorActivityEntry } from './sessionTypes';

const STORAGE_KEY = 'rc_instructor_activity_v1';

type InstructorActivityStore = Partial<Record<string, InstructorActivityEntry[]>>;

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

export function getCachedInstructorActivities(instructorId: string): InstructorActivityEntry[] | null {
  const store = readStore();
  return store[instructorId] ?? null;
}

export function setCachedInstructorActivities(instructorId: string, activities: InstructorActivityEntry[]): void {
  const store = readStore();
  store[instructorId] = activities;
  writeStore(store);
}

/** Drops every entry, for every instructor — see lib/clientCaches.ts. */
export function clearCachedInstructorActivities(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
