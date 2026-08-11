'use client';

// REQ-DL-5: real client for POST /api/instructor/courses — same role as
// lib/acceptanceCriteriaClient.ts for the write-acceptance-criteria routes. lib/mockCourses.ts
// still backs every other course operation (list/detail/edit/roster) until their routes exist;
// see that file's header for what's still missing.

export type { Course } from './mockCourses';
import type { Course } from './mockCourses';
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

type CreatedCourse = { id: string; name: string; code: string; createdAt: string };

/**
 * Creates a course and generates its unique join code server-side (POST /api/instructor/courses).
 *
 * professorName and enrollmentKey never reach the request — the route only accepts `name`:
 *  - professorName isn't a course column at all (course only stores creator_id); it's merged
 *    in here purely so the caller's already-known display name shows up immediately, the same
 *    denormalized-display-name idea lib/mockCourses.ts documents, just computed client-side
 *    until a real GET route exists to join it from "user" instead.
 *  - enrollmentKey has no column on the real `course` table (REQ-DL-5 uses a nullable
 *    course_code instead — a codeless course is instructor-assigned rather than gated by a
 *    key). It's echoed back into the local Course object so the form's existing behavior is
 *    unchanged, but it is NOT persisted; it will not survive a reload or another device.
 *
 * studentIds starts empty since a brand-new course has no student_course rows yet.
 */
export async function createCourse(
  token: string,
  name: string,
  professorName: string,
  enrollmentKey: string | null,
): Promise<ApiResult<{ course: Course }>> {
  const result = await request<{ course: CreatedCourse }>(
    '/api/instructor/courses',
    postJson({ name }),
    token,
  );
  if (!result.ok) return result;

  const { course } = result.data;
  return {
    ok: true,
    data: {
      course: {
        id: course.id,
        name: course.name,
        code: course.code,
        createdAt: toInstant(course.createdAt),
        studentIds: [],
        professorName,
        enrollmentKey,
      },
    },
  };
}
