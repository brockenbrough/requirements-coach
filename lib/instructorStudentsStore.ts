// Local cache for the instructor's student roster (GET /api/instructor/students, GitHub #146).
// Same shape as activityLogStore/completedSessionsStore: versioned key, SSR-guarded read/write,
// only typed getter/setter exported — no raw store object.
//
// Keyed by instructorId so the cache survives across mounts without re-fetching the full roster.
// No invalidation is needed: the student list only changes when someone registers, which the
// instructor's browser never causes — a manual forceRefresh covers the rare case.
import type { StudentSummary } from './sessionClient';

const STORAGE_KEY = 'rc_instructor_students_v1';

type InstructorStudentsStore = Partial<Record<string, StudentSummary[]>>;

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

export function getCachedInstructorStudents(instructorId: string): StudentSummary[] | null {
  const store = readStore();
  return store[instructorId] ?? null;
}

export function setCachedInstructorStudents(instructorId: string, students: StudentSummary[]): void {
  const store = readStore();
  store[instructorId] = students;
  writeStore(store);
}
