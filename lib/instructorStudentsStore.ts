// Local cache for the instructor's student roster (GET /api/instructor/students, GitHub #146).
// Same shape as activityLogStore/completedSessionsStore: versioned key, SSR-guarded read/write,
// only typed getter/setter exported — no raw store object.
//
// v2: the route now answers two different questions behind the same path — the scoped default
// (every student enrolled in a course this instructor owns) and ?scope=all (every student in the
// system, for AddStudentModal's enrollment search) — so the key bumped from v1 to v2 and entries
// are now keyed by `${instructorId}:${scope}` rather than bare instructorId, the same "old key
// simply never read again" migration instructorActivityStore.ts used when its own cached shape
// grew a second dimension.
//
// Unlike v1's "no invalidation needed" (the student list only changed when someone registered,
// which the instructor's browser never caused), the scoped default now also changes whenever the
// instructor enrolls or unenrolls a student in one of their own courses — courseClient.ts's
// addStudentToCourse/removeStudentFromCourse callers clear this cache after a successful mutation
// (same precedent as leaderboardCoursesStore's clear-on-join).
import type { StudentSummary } from './sessionClient';

const STORAGE_KEY = 'rc_instructor_students_v2';

export type InstructorStudentsScope = 'owned' | 'all';

type InstructorStudentsStore = Partial<Record<string, StudentSummary[]>>;

function cacheKey(instructorId: string, scope: InstructorStudentsScope): string {
  return `${instructorId}:${scope}`;
}

function readStore(): InstructorStudentsStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as InstructorStudentsStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: InstructorStudentsStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getCachedInstructorStudents(instructorId: string, scope: InstructorStudentsScope): StudentSummary[] | null {
  const store = readStore();
  return store[cacheKey(instructorId, scope)] ?? null;
}

export function setCachedInstructorStudents(instructorId: string, scope: InstructorStudentsScope, students: StudentSummary[]): void {
  const store = readStore();
  store[cacheKey(instructorId, scope)] = students;
  writeStore(store);
}

/** Drops every entry, for every instructor and every scope — see lib/clientCaches.ts. */
export function clearCachedInstructorStudents(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
