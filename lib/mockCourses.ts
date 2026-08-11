'use client';

// GitHub #241 (UI-1) + its follow-up (course overview/detail/roster management): mock for
// API-1 and friends — the courses backend, which doesn't exist yet (built separately, per the
// issue). Same "mock now, swap later" shape as lib/acceptanceCriteriaClient.ts and
// lib/instructorLlmConfigClient.ts: ApiResult<T>, a token parameter already threaded through
// even though unused, and a simulated network delay so the UI's disabled/loading states are
// exercised the same way they will be against the real calls.
//
// Still missing for a real backend integration:
//   - A `courses` table in supabase/schema.sql (course_id, name, code, instructor user_id,
//     created_at), with a unique constraint on code, and a `course_student` join table
//     (course_id, student user_id) instead of this file's studentIds: string[] array.
//   - POST /api/instructor/courses, PATCH /api/instructor/courses/:id, GET .../courses,
//     GET .../courses/:id — all behind requireInstructor() (lib/instructorAuth.ts), and scoped
//     so an instructor only ever sees/edits their own courses.
//   - POST/DELETE .../courses/:id/students — add/remove, with the search-by-name-or-email this
//     mock's searchMockStudents stands in for actually querying "user" instead of a fixed list.
//   - Whatever "a student joins a course by code" flow eventually consumes the code — still out
//     of scope here, same as it was for the original create-course issue.
//   - This whole mock is one shared module-level array — it resets on a hard reload and is not
//     scoped per instructor (every instructor account sees the same mock courses). A real
//     implementation scopes every read/write to the caller's own courses.

export type Course = {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  /** Real backend: a course_student join table, not an embedded array — see file header. */
  studentIds: string[];
};

/**
 * What the course roster needs to render a row per enrolled student — deliberately the same
 * shape as StudentAggregate (lib/activityLogTypes.ts), the real thing this stands in for, so a
 * real "list this course's students" endpoint can return exactly this and CourseStudentList
 * doesn't need to change.
 */
export type MockCourseStudent = {
  id: string;
  name: string;
  attempts: number;
  averageScore: number | null;
  abandonedCount: number;
  needsAttention: boolean;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const MOCK_DELAY_MS = 600;
const SEARCH_DELAY_MS = 250;
const CODE_LENGTH = 6;
// No 0/O/1/I — a code an instructor reads out loud or a student retypes by hand shouldn't
// hinge on telling those apart.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateCourseCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// A fixed roster to add students from/display within a course — placeholder for a real
// "search students by name/email" endpoint (see file header).
const MOCK_STUDENT_DIRECTORY: MockCourseStudent[] = [
  { id: 'mock-student-1', name: 'Alex Chen', attempts: 8, averageScore: 82, abandonedCount: 0, needsAttention: false },
  { id: 'mock-student-2', name: 'Morgan Lee', attempts: 5, averageScore: 64, abandonedCount: 1, needsAttention: true },
  { id: 'mock-student-3', name: 'Priya Nair', attempts: 12, averageScore: 91, abandonedCount: 0, needsAttention: false },
  { id: 'mock-student-4', name: 'Jordan Alvarez', attempts: 10, averageScore: 67, abandonedCount: 1, needsAttention: true },
  { id: 'mock-student-5', name: 'Sam Okafor', attempts: 3, averageScore: 88, abandonedCount: 0, needsAttention: false },
  { id: 'mock-student-6', name: 'Taylor Kim', attempts: 6, averageScore: 73, abandonedCount: 0, needsAttention: false },
  { id: 'mock-student-7', name: 'Riley Novak', attempts: 4, averageScore: 55, abandonedCount: 2, needsAttention: true },
  { id: 'mock-student-8', name: 'Casey Fischer', attempts: 9, averageScore: 79, abandonedCount: 0, needsAttention: false },
];

// Module-level "server" — resets on a hard reload, same as every other not-yet-backed mock in
// this codebase (lib/mockQuestions.ts, lib/instructorLlmConfigClient.ts's mockConfig).
let mockCourses: Course[] = [
  {
    id: 'mock-course-1',
    name: 'Software Requirements — Fall 2026',
    code: 'FALL26',
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    studentIds: ['mock-student-1', 'mock-student-2', 'mock-student-3', 'mock-student-4'],
  },
  {
    id: 'mock-course-2',
    name: 'Requirements Engineering — Spring 2026',
    code: 'SPR26X',
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    studentIds: ['mock-student-5', 'mock-student-6'],
  },
];

function findCourseOrError(courseId: string): { ok: true; course: Course } | { ok: false; status: number; error: string } {
  const course = mockCourses.find((c) => c.id === courseId);
  if (!course) return { ok: false, status: 404, error: 'Course not found.' };
  return { ok: true, course };
}

/** Mocks GET /api/instructor/courses — every course belonging to the signed-in instructor. */
export async function loadCourses(token: string): Promise<ApiResult<{ courses: Course[] }>> {
  void token;
  await delay(MOCK_DELAY_MS);
  return { ok: true, data: { courses: [...mockCourses] } };
}

/** Mocks GET /api/instructor/courses/:id. */
export async function loadCourse(token: string, courseId: string): Promise<ApiResult<{ course: Course }>> {
  void token;
  await delay(MOCK_DELAY_MS);
  const found = findCourseOrError(courseId);
  if (!found.ok) return found;
  return { ok: true, data: { course: found.course } };
}

/**
 * Mocks POST /api/instructor/courses. Takes `token` (unused for now) so the call site already
 * matches every other client wrapper's request(url, init, token) convention — swapping this for
 * a real fetch later doesn't change the signature CreateCourseForm calls it with.
 */
export async function createCourse(token: string, name: string): Promise<ApiResult<{ course: Course }>> {
  void token;
  await delay(MOCK_DELAY_MS);

  if (!name.trim()) {
    return { ok: false, status: 400, error: 'Course name is required.' };
  }

  const course: Course = {
    id: `mock-course-${Date.now()}`,
    name: name.trim(),
    code: generateCourseCode(),
    createdAt: new Date().toISOString(),
    studentIds: [],
  };

  mockCourses = [course, ...mockCourses];
  return { ok: true, data: { course } };
}

/** Mocks PATCH /api/instructor/courses/:id — currently only the name is editable. */
export async function updateCourseName(token: string, courseId: string, name: string): Promise<ApiResult<{ course: Course }>> {
  void token;
  await delay(MOCK_DELAY_MS);

  if (!name.trim()) {
    return { ok: false, status: 400, error: 'Course name is required.' };
  }
  const found = findCourseOrError(courseId);
  if (!found.ok) return found;

  mockCourses = mockCourses.map((c) => (c.id === courseId ? { ...c, name: name.trim() } : c));
  return { ok: true, data: { course: mockCourses.find((c) => c.id === courseId)! } };
}

/** Mocks POST /api/instructor/courses/:id/students. */
export async function addStudentToCourse(token: string, courseId: string, studentId: string): Promise<ApiResult<{ course: Course }>> {
  void token;
  await delay(MOCK_DELAY_MS);

  const found = findCourseOrError(courseId);
  if (!found.ok) return found;
  if (found.course.studentIds.includes(studentId)) {
    return { ok: false, status: 409, error: 'This student is already in the course.' };
  }

  mockCourses = mockCourses.map((c) => (c.id === courseId ? { ...c, studentIds: [...c.studentIds, studentId] } : c));
  return { ok: true, data: { course: mockCourses.find((c) => c.id === courseId)! } };
}

/** Mocks DELETE /api/instructor/courses/:id/students/:studentId. */
export async function removeStudentFromCourse(token: string, courseId: string, studentId: string): Promise<ApiResult<{ course: Course }>> {
  void token;
  await delay(MOCK_DELAY_MS);

  const found = findCourseOrError(courseId);
  if (!found.ok) return found;

  mockCourses = mockCourses.map((c) => (c.id === courseId ? { ...c, studentIds: c.studentIds.filter((id) => id !== studentId) } : c));
  return { ok: true, data: { course: mockCourses.find((c) => c.id === courseId)! } };
}

/**
 * Resolves enrolled-student ids into display info (name, stats) for CourseStudentList. Kept
 * synchronous and separate from the async CRUD above — it's a pure local lookup, not something
 * standing in for its own network round trip; a real course-detail response would most likely
 * embed this directly instead of needing a second call.
 */
export function getMockCourseStudent(studentId: string): MockCourseStudent | undefined {
  return MOCK_STUDENT_DIRECTORY.find((s) => s.id === studentId);
}

/** Mocks a "search students by name/email" endpoint for AddStudentForm's suggestion list. */
export async function searchMockStudents(token: string, query: string): Promise<ApiResult<{ students: MockCourseStudent[] }>> {
  void token;
  await delay(SEARCH_DELAY_MS);

  const q = query.trim().toLowerCase();
  if (!q) return { ok: true, data: { students: [] } };

  return { ok: true, data: { students: MOCK_STUDENT_DIRECTORY.filter((s) => s.name.toLowerCase().includes(q)) } };
}
