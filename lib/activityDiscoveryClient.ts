'use client';

// Real client for the student-facing activity discovery routes (GET /api/activities,
// GET /api/activities/{activityType}) — same thin-wrapper shape as lib/quizClient.ts. A catalog
// has no course of its own; it's reachable by a student only through an assembled_quiz (GitHub
// #360) that references it and belongs to a course they're enrolled in
// (lib/activityCourseQueries.ts), and these two routes are how a student finds out which ones
// their own enrolled courses actually offer.

import type { GradingKind } from './activityTypes';

export type CourseActivity = {
  activityType: string;
  name: string;
  description: string | null;
  /** GitHub #379: 'mcq' or 'llm-graded' — which play flow this activity enters. */
  gradingKind: GradingKind;
  courseId: string;
  courseName: string;
  /** GitHub #583: the specific assembled_quiz this entry came from — see
   *  lib/activityContent.ts's ActivityDefinition.assembledQuizId for why this matters. */
  assembledQuizId: string;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const NETWORK_ERROR = 'Could not reach the server. Please try again.';

async function request<T>(url: string, token: string): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, status: response.status, error: body?.error || 'Something went wrong.' };
  }

  return { ok: true, data: body as T };
}

/**
 * Every activity (built-in or instructor-created) linked to a course the caller is enrolled in
 * (GET /api/activities). Not cached — same reasoning as loadStudentTitles: course membership and
 * catalog linkage can both change between visits, and this list is cheap enough to just refetch.
 *
 * An optional courseId (GitHub #427) narrows this to just that one course's activities — the
 * student course-detail page's "quizzes in this course" list.
 */
export function loadAvailableActivities(
  token: string,
  options?: { courseId?: string },
): Promise<ApiResult<{ activities: CourseActivity[] }>> {
  const url = options?.courseId ? `/api/activities?courseId=${encodeURIComponent(options.courseId)}` : '/api/activities';
  return request<{ activities: CourseActivity[] }>(url, token);
}

/**
 * One activity's own display metadata (GET /api/activities/{activityType}) — the fallback
 * app/activities/[slug]/page.tsx and its play page use when the slug isn't one of the three
 * built-ins lib/activityContent.ts knows statically, i.e. a course-scoped custom catalog reached
 * directly by its activity_type key.
 *
 * GitHub #583: an optional assembledQuizId (the ?quiz= a student followed from a course page
 * card) disambiguates which of possibly several assembled quizzes composing this catalog is
 * meant; the route 403s if it names one that doesn't actually grant access.
 */
export function loadActivityMeta(
  token: string,
  activityType: string,
  assembledQuizId?: string,
): Promise<ApiResult<{ activity: CourseActivity }>> {
  const query = assembledQuizId ? `?assembledQuizId=${encodeURIComponent(assembledQuizId)}` : '';
  return request<{ activity: CourseActivity }>(`/api/activities/${encodeURIComponent(activityType)}${query}`, token);
}
