'use client';

// REQ-DL-5: real client for the student-facing course routes (browse + join) — the student
// counterpart to lib/courseClient.ts, which is instructor-only (see that file's header). Backs
// app/courses/page.tsx, components/StudentCourseCard.tsx, and components/MyCoursesSection.tsx.

import type { CourseMeta, JoinableCourse } from './courseTypes';
import { toInstant } from './dateTime';

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

/**
 * GET /api/courses — every course a student can self-enroll in by code, with this student's own
 * alreadyMember flag already computed server-side.
 */
export async function loadJoinableCourses(token: string): Promise<ApiResult<{ courses: JoinableCourse[] }>> {
  const result = await request<{ courses: JoinableCourse[] }>('/api/courses', { method: 'GET' }, token);
  if (!result.ok) return result;

  return { ok: true, data: { courses: result.data.courses.map((c) => ({ ...c, createdAt: toInstant(c.createdAt) })) } };
}

/**
 * POST /api/courses/join — joins a course by its code. Idempotent: joining a course the caller
 * already belongs to returns alreadyMember: true instead of an error (see the route's own docs).
 */
export function joinCourseByCode(token: string, code: string): Promise<ApiResult<{ course: CourseMeta; alreadyMember: boolean }>> {
  return request<{ course: CourseMeta; alreadyMember: boolean }>('/api/courses/join', postJson({ code }), token);
}
