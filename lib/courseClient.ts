'use client';

// REQ-DL-5: real client for the instructor course routes — same role as
// lib/llmActivityClient.ts. The student-facing "browse/join a course" UI (GitHub #242/
// UI-2) is real too now, via lib/studentCourseClient.ts — a separate file since these two are
// genuinely different audiences/routes, not a style variant of each other.

import type { CourseDetail, CourseMeta, CourseStudent, CourseSummary } from './courseTypes';
import type { AssembledQuizSummary } from './assembledQuizClient';
import { toInstant } from './dateTime';

export type { CourseDetail, CourseMeta, CourseStudent, CourseSummary } from './courseTypes';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const NETWORK_ERROR = 'Could not reach the server. Please try again.';

async function request<T>(url: string, init: RequestInit, token: string): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  } catch {
    // status 0 marks "never reached the server", so callers can tell it apart from a 500.
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, status: response.status, error: body?.error || 'Something went wrong.' };
  }

  return { ok: true, data: body as T };
}

function postJson(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

function patchJson(payload: unknown): RequestInit {
  return {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

/**
 * Creates a course and generates its unique join code server-side (POST /api/instructor/courses).
 *
 * No professorName or enrollmentKey parameter: course only stores creator_id (no display-name
 * column, and nothing renders one today), and course_code's nullability is REQ-DL-5's actual
 * answer to "open vs. instructor-assigned" enrollment, not a gate layered on top of a code — so
 * neither ever had a column to persist to. The create-course form no longer collects either.
 */
export async function createCourse(token: string, name: string): Promise<ApiResult<{ course: CourseSummary }>> {
  const result = await request<{ course: CourseMeta }>('/api/instructor/courses', postJson({ name }), token);
  if (!result.ok) return result;

  return { ok: true, data: { course: { ...result.data.course, createdAt: toInstant(result.data.course.createdAt), studentCount: 0 } } };
}

/** Every course the calling instructor created, with a per-course enrollment count (GET /api/instructor/courses). */
export async function loadCourses(token: string): Promise<ApiResult<{ courses: CourseSummary[] }>> {
  const result = await request<{ courses: CourseSummary[] }>('/api/instructor/courses', { method: 'GET' }, token);
  if (!result.ok) return result;

  return { ok: true, data: { courses: result.data.courses.map((c) => ({ ...c, createdAt: toInstant(c.createdAt) })) } };
}

/**
 * One course plus its enrolled students' attempt/score summaries (GET /api/instructor/courses/{id}).
 * The roster arrives fully embedded — no separate per-student lookup needed.
 */
export async function loadCourse(token: string, courseId: string): Promise<ApiResult<{ course: CourseDetail }>> {
  const result = await request<{ course: CourseMeta; students: CourseStudent[] }>(
    `/api/instructor/courses/${encodeURIComponent(courseId)}`,
    { method: 'GET' },
    token,
  );
  if (!result.ok) return result;

  const { course, students } = result.data;
  return { ok: true, data: { course: { ...course, createdAt: toInstant(course.createdAt), students } } };
}

/**
 * Duplicates a course's setup — quizzes and settings, never enrollments or attempt history
 * (GitHub #362, POST /api/instructor/courses/{id}/duplicate). Returns the new course in the same
 * CourseSummary shape createCourse does (studentCount always 0 here — see the route's own
 * comment), so both can feed the same list-prepend logic on app/instructor/courses/page.tsx.
 *
 * No enrollmentKey parameter, for the same reason createCourse has none.
 */
export async function duplicateCourse(token: string, courseId: string, params: { name: string }): Promise<ApiResult<{ course: CourseSummary }>> {
  const result = await request<{ course: CourseSummary }>(
    `/api/instructor/courses/${encodeURIComponent(courseId)}/duplicate`,
    postJson({ name: params.name }),
    token,
  );
  if (!result.ok) return result;

  return { ok: true, data: { course: { ...result.data.course, createdAt: toInstant(result.data.course.createdAt) } } };
}

/** Renames a course (PATCH /api/instructor/courses/{id}). No enrollmentKey — see createCourse. */
export async function updateCourse(token: string, courseId: string, updates: { name: string }): Promise<ApiResult<{ course: CourseMeta }>> {
  const result = await request<{ course: CourseMeta }>(
    `/api/instructor/courses/${encodeURIComponent(courseId)}`,
    patchJson({ name: updates.name }),
    token,
  );
  if (!result.ok) return result;

  return { ok: true, data: { course: { ...result.data.course, createdAt: toInstant(result.data.course.createdAt) } } };
}

/**
 * Deletes a course and every enrollment in it (DELETE /api/instructor/courses/{id}, GitHub #327).
 *
 * unenrolledCount is how many students the cascade actually removed, counted server-side just
 * before the delete — the dialog that asks for confirmation shows its own, possibly seconds-old
 * count from the roster already in hand, so this is the authoritative number, not that one.
 *
 * The students' attempt history and scores are untouched; only the course, its join code and its
 * CSV export go away. See the route's docblock for why that split is the way it is.
 */
export function deleteCourse(token: string, courseId: string): Promise<ApiResult<{ courseId: string; unenrolledCount: number }>> {
  return request<{ courseId: string; unenrolledCount: number }>(
    `/api/instructor/courses/${encodeURIComponent(courseId)}`,
    { method: 'DELETE' },
    token,
  );
}

/**
 * Every assembled quiz linked to a course (GET /api/instructor/courses/{id}/quizzes, GitHub #362
 * follow-up) — backs the course detail page's own "Quizzes" section. Same AssembledQuizSummary
 * shape lib/assembledQuizClient.ts's loadAssembledQuizzes returns, and like that function, leaves
 * createdAt as the raw server string — this route's caller never displays it, so there's nothing
 * for toInstant to protect against misreading here.
 */
export function loadCourseQuizzes(token: string, courseId: string): Promise<ApiResult<{ quizzes: AssembledQuizSummary[] }>> {
  return request<{ quizzes: AssembledQuizSummary[] }>(
    `/api/instructor/courses/${encodeURIComponent(courseId)}/quizzes`,
    { method: 'GET' },
    token,
  );
}

export type CourseActivityStats = {
  quizId: string;
  quizName: string;
  classAverage: number;
  passRate: number;
  completionCount: number;
  enrolledCount: number;
};

/** Per-quiz completion stats scoped to a course (GET /api/instructor/statistics?courseId=). */
export function loadCourseStats(token: string, courseId: string): Promise<ApiResult<{ statistics: CourseActivityStats[] }>> {
  return request<{ statistics: CourseActivityStats[] }>(
    `/api/instructor/statistics?courseId=${encodeURIComponent(courseId)}`,
    { method: 'GET' },
    token,
  );
}

/** Enrolls a student in a course (POST /api/instructor/courses/{id}/students). */
export function addStudentToCourse(token: string, courseId: string, studentId: string): Promise<ApiResult<{ student: CourseStudent }>> {
  return request<{ student: CourseStudent }>(
    `/api/instructor/courses/${encodeURIComponent(courseId)}/students`,
    postJson({ studentId }),
    token,
  );
}

/**
 * Removes a student's enrollment link only (DELETE /api/instructor/courses/{id}/students/{studentId}).
 * Their attempt/score history elsewhere in the app is untouched — see the route's docblock.
 */
export function removeStudentFromCourse(token: string, courseId: string, studentId: string): Promise<ApiResult<{ studentId: string }>> {
  return request<{ studentId: string }>(
    `/api/instructor/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}`,
    { method: 'DELETE' },
    token,
  );
}

/**
 * Downloads a depersonalized CSV report of a course's student activity (GET
 * /api/instructor/courses/{id}/export, REQ-PL-3.4.3) and triggers it as a browser download.
 * Unlike every other function here, the response body is CSV, not JSON, so this bypasses the
 * shared request() helper (which always parses JSON on success) and reads the filename off
 * Content-Disposition instead of a response field.
 */
export async function exportCourseReport(token: string, courseId: string): Promise<ApiResult<{ filename: string }>> {
  let response: Response;

  try {
    response = await fetch(`/api/instructor/courses/${encodeURIComponent(courseId)}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return { ok: false, status: response.status, error: body?.error || 'Something went wrong.' };
  }

  const match = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '');
  const filename = match?.[1] ?? 'course-report.csv';

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { ok: true, data: { filename } };
}
