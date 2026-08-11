'use client';

// GitHub #242 (UI-2, student browse/join): mock for API-2 — the student-facing "browse courses
// and join one" backend, which doesn't exist yet. Same "mock now, swap later" shape as
// lib/acceptanceCriteriaClient.ts and lib/instructorLlmConfigClient.ts: ApiResult<T>, a token
// parameter already threaded through even though unused, and a simulated network delay so the
// UI's disabled/loading states are exercised the same way they will be against the real calls.
//
// The instructor side (GitHub #241, UI-1) is fully real now: POST/GET/PATCH
// /api/instructor/courses[/:id] and POST/DELETE .../courses/:id/students (lib/courseClient.ts,
// lib/courseQueries.ts, REQ-DL-5) replaced every instructor-only export this file used to have —
// loadCourse (singular), updateCourse, removeStudentFromCourse, getMockCourseStudent,
// searchMockStudents, MockCourseStudent and MOCK_STUDENT_DIRECTORY are gone; nothing student-
// facing ever called them.
//
// What's left is still mock because it backs a different, still-unbuilt feature: the student
// side of course membership. loadCourses/addStudentToCourse/joinCourse and the module-level
// mockCourses array are consumed by app/courses/page.tsx, components/MyCoursesSection.tsx, and
// components/StudentCourseCard.tsx (GitHub #242) — a student browsing/joining a course by
// clicking around the UI, which is a genuinely different flow from POST /api/courses/join
// (app/api/courses/join/route.ts, REQ-DL-5, already real): that route is code-only (body: { code
// }, no id, no enrollmentKey) and derives the student from the token, unlike this mock's
// joinCourse(token, courseId, studentId, enrollmentKey), which StudentCourseCard.tsx still calls.
// Rewiring that component to the real route (and dropping the enrollmentKey step, which has no
// server-side equivalent — course_code's nullability is REQ-DL-5's actual answer to "open vs.
// instructor-assigned" enrollment, not a gate on top of a code) is still open.
//
// Still missing for a real backend integration:
//   - POST /api/courses/:id/join or equivalent, deriving the student from the caller's own
//     token, never a body param the way joinCourse still has to accept one here.
//   - GET /api/courses (student-facing "browse all") — a student shouldn't need
//     instructor-scoped auth just to browse what's joinable, and its response must not include
//     the raw enrollmentKey (a requiresEnrollmentKey boolean instead, if that concept survives
//     at all — see the enrollmentKey note above).
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
   * (first_name/last_name), not stored as a separate relation.
   */
  professorName: string;
  /**
   * GitHub #242 follow-up: optional gate on self-service joining — null means open enrollment.
   * Mirrors a nullable DB column exactly (not an empty string for "none"), so `!!course.enrollmentKey`
   * is always the right "does this course require a key" check on both sides.
   *
   * SECURITY NOTE for the real integration: this mock embeds the real key value directly in
   * what loadCourses returns, which a real GET /api/courses must never do — the student-facing
   * list response should only ever carry a boolean (e.g. requiresEnrollmentKey), and the actual
   * key comparison in joinCourse below must happen server-side in the real route, not in client
   * code where the key would be readable in the network response/bundle.
   */
  enrollmentKey: string | null;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const MOCK_DELAY_MS = 600;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/** Mocks GET /api/courses (student-facing "browse all") — every course, joined or not. */
export async function loadCourses(token: string): Promise<ApiResult<{ courses: Course[] }>> {
  void token;
  await delay(MOCK_DELAY_MS);
  return { ok: true, data: { courses: [...mockCourses] } };
}

/** Mocks the studentIds mutation behind joining/being added to a course. */
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
 * GitHub #242 (UI-2) + follow-up (enrollment key): mocks a student joining a course themselves,
 * by browsing rather than being added by an instructor. Validates enrollmentKey here, in the
 * mock, purely so the UI's error path has something real to exercise — this comparison MUST
 * move server-side in the real route (see this file's header and the SECURITY NOTE on
 * Course.enrollmentKey); a real GET response should never have sent the key to the client in
 * the first place, so there'd be nothing to compare against here.
 *
 * Delegates to addStudentToCourse for the actual studentIds mutation once the key checks out.
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
