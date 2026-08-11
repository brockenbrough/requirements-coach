'use client';

// REQ-DL-5: real client for the instructor course routes — same role as
// lib/acceptanceCriteriaClient.ts. lib/mockCourses.ts still backs the student-facing "browse/
// join a course" UI (a different, still-mock feature, GitHub #242/UI-2) — see that file's header.

import type { CourseDetail, CourseMeta, CourseStudent, CourseSummary } from './courseTypes';
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
