'use client';

// GitHub #241 (UI-1, instructor create/manage) + #242 (UI-2, student browse/join): mock for
// API-1/API-2 and friends — the courses backend, which doesn't exist yet (built separately, per
// both issues). Same "mock now, swap later" shape as lib/acceptanceCriteriaClient.ts and
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
//     so an instructor only ever sees/edits their own courses. createCourse's professorName
//     must come from the instructor's own "user" row server-side, never a client-supplied value.
//   - POST/DELETE .../courses/:id/students — add/remove, with the search-by-name-or-email this
//     mock's searchMockStudents stands in for actually querying "user" instead of a fixed list.
//   - POST /api/courses/:id/join (API-2) — student-facing, deriving the student from the
//     caller's own token, never a body param the way joinCourse still has to accept one here.
//     The enrollmentKey comparison MUST happen in this route, server-side — see the SECURITY
//     NOTE on Course.enrollmentKey below for why the mock's approach (comparing in the client)
//     is only acceptable because it's mock data.
//     GET /api/courses (student-facing "browse all") likely needs its own route too, rather
//     than reusing the instructor's GET .../courses — a student shouldn't need
//     instructor-scoped auth just to browse what's joinable, and its response must not include
//     the raw enrollmentKey (a requiresEnrollmentKey boolean instead).
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
  /**
   * Denormalized display name — a real GET would join this from the instructor's "user" row
   * (first_name/last_name), the same way it's derived here from the real signed-in instructor's
   * own profile at creation time (see CreateCourseForm), not stored as a separate relation.
   */
  professorName: string;
  /**
   * GitHub #242 follow-up: optional gate on self-service joining — null means open enrollment.
   * Mirrors a nullable DB column exactly (not an empty string for "none"), so `!!course.enrollmentKey`
   * is always the right "does this course require a key" check on both sides.
   *
   * SECURITY NOTE for the real integration: this mock embeds the real key value directly in
   * what loadCourses/loadCourse return, which a real GET /api/courses must never do — the
   * student-facing list response should only ever carry a boolean (e.g. requiresEnrollmentKey),
   * and the actual key comparison in joinCourse below must happen server-side in the real
   * route, not in client code where the key would be readable in the network response/bundle.
   */
  enrollmentKey: string | null;
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
    professorName: 'Dr. Brockenbrough',
    // Has a key, so both states (with/without) are exercisable in the UI out of the box.
    enrollmentKey: 'REQ2026',
  },
  {
    id: 'mock-course-2',
    name: 'Requirements Engineering — Spring 2026',
    code: 'SPR26X',
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    studentIds: ['mock-student-5', 'mock-student-6'],
    professorName: 'Dr. Osei',
    enrollmentKey: null,
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
 * a real fetch later doesn't change the signature CreateCourseForm calls it with. professorName
 * is passed in by the caller (the real signed-in instructor's own name) rather than looked up
 * here — a real route would derive it server-side from the "user" row the token resolves to,
 * the same way it derives user_id everywhere else in this app, never trust a client-supplied name.
 */
export async function createCourse(
  token: string,
  name: string,
  professorName: string,
  enrollmentKey: string | null,
): Promise<ApiResult<{ course: Course }>> {
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
    professorName,
    enrollmentKey,
  };

  mockCourses = [course, ...mockCourses];
  return { ok: true, data: { course } };
}

/**
 * Mocks PATCH /api/instructor/courses/:id — name and enrollmentKey together (one Save in
 * EditCourseModal, one call). Renamed from the original updateCourseName now that it covers
 * more than the name.
 */
export async function updateCourse(
  token: string,
  courseId: string,
  updates: { name: string; enrollmentKey: string | null },
): Promise<ApiResult<{ course: Course }>> {
  void token;
  await delay(MOCK_DELAY_MS);

  if (!updates.name.trim()) {
    return { ok: false, status: 400, error: 'Course name is required.' };
  }
  const found = findCourseOrError(courseId);
  if (!found.ok) return found;

  mockCourses = mockCourses.map((c) =>
    c.id === courseId ? { ...c, name: updates.name.trim(), enrollmentKey: updates.enrollmentKey } : c,
  );
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

/**
 * GitHub #242 (UI-2) + follow-up (enrollment key): mocks POST /api/courses/:id/join — a student
 * joining a course themselves, by code/browsing rather than being added by an instructor.
 * Validates enrollmentKey here, in the mock, purely so the UI's error path has something real
 * to exercise — this comparison MUST move server-side in the real route (see this file's header
 * and the SECURITY NOTE on Course.enrollmentKey); a real GET response should never have sent
 * the key to the client in the first place, so there'd be nothing to compare against here.
 *
 * Delegates to addStudentToCourse for the actual studentIds mutation once the key checks out —
 * kept as its own export because the real API-2 this stands in for is a genuinely different
 * endpoint from addStudentToCourse's real counterpart: self-service, and — like every other
 * student-facing route in this app — deriving the student from the caller's own token
 * server-side, never a body param the way this mock still has to accept one.
 */
export async function joinCourse(
  token: string,
  courseId: string,
  studentId: string,
  enrollmentKey?: string,
): Promise<ApiResult<{ course: Course }>> {
  void token;
  await delay(MOCK_DELAY_MS);

  const found = findCourseOrError(courseId);
  if (!found.ok) return found;

  if (found.course.enrollmentKey && found.course.enrollmentKey !== (enrollmentKey ?? '').trim()) {
    return { ok: false, status: 403, error: 'Incorrect enrollment key. Check with your instructor and try again.' };
  }

  return addStudentToCourse(token, courseId, studentId);
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
