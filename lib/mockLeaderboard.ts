// Hardcoded leaderboard data for the Phase-1 UI. This is the ONLY fake data source behind
// /leaderboard, the dashboard preview and /students/[id], so replacing it with the real
// GET /api/courses/{courseId}/leaderboard is a single-import swap.
//
// DELETE THIS FILE once that route lands. lib/mockStudentAttempts.ts is the cautionary tale:
// it still drives app/instructor/students/[id]/page.tsx with fabricated data long after the
// feature was "done", and nothing in the UI admits it.
//
// What a real endpoint has to return for the UI to keep working unchanged:
//   LeaderboardEntry[], already sorted by rank ascending, with standard competition ranking on
//   ties (1, 2, 2, 4) and a deterministic secondary sort (username) so two requests can't
//   disagree about who is second. rankChange is NOT part of the response — the client derives it
//   from lib/previousRankStore.ts and overwrites whatever is here.
//
// The rows below deliberately cover every case the UI has to render: a two-way tie, students
// with and without an avatar, all four rankChange states (up / down / unchanged / unknown),
// a zero-point student who is enrolled but has never finished an activity, and enough rows to
// force a second page.

import type { LeaderboardCourse, LeaderboardEntry } from './leaderboardTypes';

/**
 * A tiny inline SVG avatar, so the <img> branch is actually exercised offline — real avatars are
 * public Supabase Storage URLs (see app/api/profile/avatar/route.ts) which don't exist in a
 * fresh dev database.
 */
function mockAvatar(background: string, initials: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${background}"/><text x="32" y="42" font-family="Arial" font-size="26" font-weight="bold" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const REQUIREMENTS_ENGINEERING: LeaderboardEntry[] = [
  { rank: 1, studentId: 'mock-stu-01', username: 'mkellner', avatarUrl: mockAvatar('#7c4dff', 'MK'), points: 1450, rankChange: 2 },
  { rank: 2, studentId: 'mock-stu-02', username: 'anne_b', avatarUrl: null, points: 1320, rankChange: -1 },
  { rank: 3, studentId: 'mock-stu-03', username: 'philipp', avatarUrl: mockAvatar('#2dd4bf', 'PH'), points: 1180, rankChange: 0 },
  // Two-way tie: same points, same rank, and rank 5 is skipped.
  { rank: 4, studentId: 'mock-stu-04', username: 'brockenbrough', avatarUrl: null, points: 1050, rankChange: 5 },
  { rank: 4, studentId: 'mock-stu-05', username: 'jvandermeer', avatarUrl: mockAvatar('#ffd666', 'JV'), points: 1050, rankChange: null },
  { rank: 6, studentId: 'mock-stu-06', username: 'sofia_r', avatarUrl: null, points: 980, rankChange: -3 },
  { rank: 7, studentId: 'mock-stu-07', username: 'tobias.w', avatarUrl: null, points: 910, rankChange: 1 },
  { rank: 8, studentId: 'mock-stu-08', username: 'nadia_k', avatarUrl: mockAvatar('#4ade80', 'NK'), points: 870, rankChange: 0 },
  { rank: 9, studentId: 'mock-stu-09', username: 'lars', avatarUrl: null, points: 720, rankChange: -2 },
  { rank: 10, studentId: 'mock-stu-10', username: 'emilia_h', avatarUrl: null, points: 690, rankChange: null },
  // From here on it is page 2 at PAGE_SIZE 10 — the signed-in student sits down here on purpose,
  // so the "Your position" strip under the table is visible on first load.
  { rank: 11, studentId: 'mock-stu-11', username: 'dmitri_s', avatarUrl: null, points: 540, rankChange: 4 },
  { rank: 12, studentId: 'mock-stu-12', username: 'you', avatarUrl: null, points: 410, rankChange: -6 },
  { rank: 13, studentId: 'mock-stu-13', username: 'carla_m', avatarUrl: null, points: 275, rankChange: 0 },
  // Enrolled but has never completed an activity. The real query must include this student
  // (roster from student_course, not from who has attempted something) rather than hide them.
  { rank: 14, studentId: 'mock-stu-14', username: 'newcomer', avatarUrl: null, points: 0, rankChange: null },
];

const SOFTWARE_ARCHITECTURE: LeaderboardEntry[] = [
  { rank: 1, studentId: 'mock-stu-06', username: 'sofia_r', avatarUrl: null, points: 620, rankChange: 3 },
  { rank: 2, studentId: 'mock-stu-12', username: 'you', avatarUrl: null, points: 480, rankChange: 1 },
  { rank: 3, studentId: 'mock-stu-01', username: 'mkellner', avatarUrl: mockAvatar('#7c4dff', 'MK'), points: 300, rankChange: -2 },
];

/** A course with a roster but no completed activity yet — exercises the table's empty state. */
const EMPTY_COURSE: LeaderboardEntry[] = [];

const BY_COURSE: Record<string, LeaderboardEntry[]> = {
  'mock-course-re': REQUIREMENTS_ENGINEERING,
  'mock-course-sa': SOFTWARE_ARCHITECTURE,
  'mock-course-empty': EMPTY_COURSE,
};

/** The courses the signed-in student is enrolled in. Real source later: lib/studentCourseClient.ts. */
export function getMockCourses(): LeaderboardCourse[] {
  return [
    { courseId: 'mock-course-re', courseName: 'Requirements Engineering' },
    { courseId: 'mock-course-sa', courseName: 'Software Architecture' },
    { courseId: 'mock-course-empty', courseName: 'Testing & QA' },
  ];
}

/**
 * One course's ranking.
 *
 * currentStudentId is a mock-only affordance: the signed-in account's real Supabase uuid can
 * never match a hardcoded id, so without it the "You" highlight and the "Your position" strip
 * would be unreachable in Phase 1. It rewrites the placeholder row's id to the real one. The
 * API-backed version takes no such parameter — the server returns real ids that already match.
 */
export function getMockLeaderboard(courseId: string, currentStudentId?: string): LeaderboardEntry[] {
  const entries = BY_COURSE[courseId] ?? [];
  if (!currentStudentId) return entries;

  return entries.map((entry) =>
    entry.studentId === 'mock-stu-12' ? { ...entry, studentId: currentStudentId } : entry,
  );
}
