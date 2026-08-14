// Session cache for "which courses can this student see a leaderboard for" (GitHub #328) — the
// alreadyMember-filtered slice of GET /api/courses, in the LeaderboardCourse shape both
// app/leaderboard/page.tsx and components/LeaderboardPreview.tsx need to pick a courseId before
// they can even ask lib/leaderboardStore.ts for entries.
//
// Deliberately a separate cache from lib/leaderboardStore.ts's entries, and NOT layered onto the
// underlying loadJoinableCourses (lib/studentCourseClient.ts) call itself — that call also backs
// app/courses/page.tsx (browse/join/leave), which must see a just-created, just-joined, or
// just-left course immediately, not after a stale session cache expires.
// Session-scoped like leaderboardStore for the same reason: a stale entry must not survive an
// app restart.
import type { LeaderboardCourse } from './leaderboardTypes';

const STORAGE_KEY = 'rc_leaderboard_courses_v1';

export function getCachedLeaderboardCourses(): LeaderboardCourse[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LeaderboardCourse[]) : null;
  } catch {
    return null;
  }
}

export function setCachedLeaderboardCourses(courses: LeaderboardCourse[]): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
}

export function clearCachedLeaderboardCourses(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
