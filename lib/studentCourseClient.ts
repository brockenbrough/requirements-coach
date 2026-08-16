'use client';

// REQ-DL-5: real client for the student-facing course routes (browse + join) — the student
// counterpart to lib/courseClient.ts, which is instructor-only (see that file's header). Backs
// app/courses/page.tsx and components/StudentCourseCard.tsx.

import type { CourseMeta, JoinableCourse } from './courseTypes';
import type { LeaderboardCourse, LeaderboardEntry } from './leaderboardTypes';
import { toInstant } from './dateTime';
import { clearCachedLeaderboard, getCachedLeaderboard, setCachedLeaderboard } from './leaderboardStore';
import { clearCachedLeaderboardCourses, getCachedLeaderboardCourses, setCachedLeaderboardCourses } from './leaderboardCoursesStore';
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
 *
 * On success, clears the leaderboard-courses session cache (lib/leaderboardCoursesStore.ts) —
 * the mirror of leaveCourse's own invalidation below. Without this, a student who had already
 * viewed the leaderboard/dashboard while enrolled in fewer (or no) courses would keep seeing that
 * stale course list for the rest of the browser session after joining, since
 * loadMyLeaderboardCourses is cache-first (GitHub #328).
 */
export function joinCourseByCode(token: string, code: string): Promise<ApiResult<{ course: CourseMeta; alreadyMember: boolean }>> {
  return request<{ course: CourseMeta; alreadyMember: boolean }>('/api/courses/join', postJson({ code }), token).then((result) => {
    if (result.ok) {
      clearCachedLeaderboardCourses();
    }
    return result;
  });
}

/**
 * DELETE /api/courses/{courseId}/enrollment — a student leaves a course they're enrolled in
 * (GitHub #324/#325). On success, clears both session caches this page family reads
 * (lib/leaderboardCoursesStore.ts and lib/leaderboardStore.ts) so the left course stops showing
 * up on the dashboard/leaderboard immediately, the same invalidation
 * app/activities/[slug]/play/page.tsx's handleFinishSummary already runs when the student's own
 * score changes — a membership change is just as stale-cache-worthy as a score change.
 */
export function leaveCourse(token: string, courseId: string): Promise<ApiResult<{ courseId: string }>> {
  return request<{ courseId: string }>(
    `/api/courses/${encodeURIComponent(courseId)}/enrollment`,
    { method: 'DELETE' },
    token,
  ).then((result) => {
    if (result.ok) {
      clearCachedLeaderboardCourses();
      clearCachedLeaderboard();
    }
    return result;
  });
}

/**
 * The alreadyMember-filtered slice of loadJoinableCourses that app/leaderboard/page.tsx and
 * components/LeaderboardPreview.tsx use to pick a courseId, cached session-scoped
 * (lib/leaderboardCoursesStore.ts, GitHub #328) so revisiting either view doesn't re-run this
 * network call — same cache-first/forceRefresh shape as loadCourseLeaderboard below. Distinct
 * from loadJoinableCourses itself, which stays uncached: app/courses/page.tsx needs a just-joined
 * or just-left course to show up without waiting for a fresh session.
 */
export function loadMyLeaderboardCourses(
  token: string,
  options: { forceRefresh?: boolean } = {},
): Promise<ApiResult<{ courses: LeaderboardCourse[] }>> {
  if (!options.forceRefresh) {
    const cached = getCachedLeaderboardCourses();
    if (cached !== null) {
      return Promise.resolve({ ok: true, data: { courses: cached } });
    }
  }

  return loadJoinableCourses(token).then((result) => {
    if (!result.ok) return result;

    const courses = result.data.courses
      .filter((course) => course.alreadyMember)
      .map((course) => ({ courseId: course.id, courseName: course.name }));
    setCachedLeaderboardCourses(courses);
    return { ok: true as const, data: { courses } };
  });
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
 * Cached in sessionStorage (lib/leaderboardStore.ts) keyed by courseId, the same shape as
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
