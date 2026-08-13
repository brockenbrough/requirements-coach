'use client';

// REQ-DL-5: real client for the student-facing course routes (browse + join) — the student
// counterpart to lib/courseClient.ts, which is instructor-only (see that file's header). Backs
// app/courses/page.tsx, components/StudentCourseCard.tsx, and components/MyCoursesSection.tsx.

import type { CourseMeta, JoinableCourse } from './courseTypes';
import type { LeaderboardEntry } from './leaderboardTypes';
import { toInstant } from './dateTime';
import { getCachedLeaderboard, setCachedLeaderboard } from './leaderboardStore';
import { getPreviousRanks, withRankChange } from './previousRankStore';

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

/** The wire shape of GET /api/courses/{courseId}/leaderboard — no rankChange; see below. */
type LeaderboardRow = {
  rank: number;
  studentId: string;
  username: string;
  avatarUrl: string | null;
  points: number;
  streak: number;
};

/**
 * One course's leaderboard (GET /api/courses/{courseId}/leaderboard).
 *
 * rankChange is not part of the server response (see LeaderboardEntry's own doc) — it is
 * attached here from lib/previousRankStore.ts's last-recorded snapshot for this course.
 * Recording the CURRENT ranks as the new snapshot is a deliberate separate step
 * (recordLeaderboardRanks) that this function does NOT perform; callers must run it once the
 * returned entries have actually rendered, or the "since your last visit" delta would compare a
 * fetch against itself. See that function's own comment.
 *
 * Cached in localStorage (lib/leaderboardStore.ts) keyed by courseId, the same shape as
 * loadStudentScore: a plain call is served from the cache when present, forceRefresh bypasses it
 * and re-caches the server's answer. Nothing on this device learns when another student's score
 * changes their own leaderboard, the same staleness loadInstructorActivities documents — callers
 * refresh explicitly, either via a Refresh control or when the signed-in student's own score
 * changes (a completed session, see app/activities/[slug]/play/page.tsx's handleFinishSummary).
 */
export function loadCourseLeaderboard(
  token: string,
  courseId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<ApiResult<{ entries: LeaderboardEntry[] }>> {
  if (!options.forceRefresh) {
    const cached = getCachedLeaderboard(courseId);
    if (cached !== null) {
      return Promise.resolve({ ok: true, data: { entries: cached } });
    }
  }

  return request<{ entries: LeaderboardRow[] }>(
    `/api/courses/${encodeURIComponent(courseId)}/leaderboard`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (!result.ok) return result;

    const entries = withRankChange(result.data.entries, getPreviousRanks(courseId));
    setCachedLeaderboard(courseId, entries);
    return { ok: true as const, data: { entries } };
  });
}
