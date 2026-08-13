// Hardcoded leaderboard rows, kept only as backing data for getMockPublicProfile below.
//
// /leaderboard and the dashboard preview (components/LeaderboardPreview.tsx) no longer read this
// file — GET /api/courses/{courseId}/leaderboard (lib/leaderboardQueries.ts) is real now, wired
// in through lib/studentCourseClient.ts's loadCourseLeaderboard. getMockCourses/getMockLeaderboard
// were deleted along with that swap.
//
// app/students/[id]/page.tsx (the public student-profile page, US-5) is the one remaining
// consumer, via getMockPublicProfile — that route doesn't exist yet, and is a separate story
// from the leaderboard. DELETE what's left of this file once GET /api/students/{id}/public-profile
// lands; lib/mockStudentAttempts.ts is the cautionary tale for leaving a "done" mock behind:
// it still drives app/instructor/students/[id]/page.tsx with fabricated data, and nothing in the
// UI admits it.
//
// The rows below still carry rankChange/streak fields (GitHub #307), even though
// getMockPublicProfile never reads either — keeping the rows shaped like a real LeaderboardEntry
// costs nothing and avoids a second, drifted shape for the same data. The real leaderboard route
// (lib/leaderboardQueries.ts) sources streak from computeStudentStreak (lib/streakQueries.ts) per
// row, same reducer GET /api/students/{id}/streak uses.
//
// The rows below deliberately cover every case a public profile has to render: a two-way tie,
// students with and without an avatar, a zero-point student who is enrolled but has never
// finished an activity, an empty biography, and a student who has passed nothing at all.

import { ACTIVITIES } from './activityContent';
import type { LeaderboardEntry, PublicStudentProfile, PublicStudentTitle } from './leaderboardTypes';

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
  { rank: 1, studentId: 'mock-stu-01', username: 'mkellner', avatarUrl: mockAvatar('#7c4dff', 'MK'), points: 1450, streak: 12, rankChange: 2 },
  { rank: 2, studentId: 'mock-stu-02', username: 'anne_b', avatarUrl: null, points: 1320, streak: 4, rankChange: -1 },
  { rank: 3, studentId: 'mock-stu-03', username: 'philipp', avatarUrl: mockAvatar('#2dd4bf', 'PH'), points: 1180, streak: 1, rankChange: 0 },
  // Two-way tie: same points, same rank, and rank 5 is skipped.
  { rank: 4, studentId: 'mock-stu-04', username: 'brockenbrough', avatarUrl: null, points: 1050, streak: 7, rankChange: 5 },
  { rank: 4, studentId: 'mock-stu-05', username: 'jvandermeer', avatarUrl: mockAvatar('#ffd666', 'JV'), points: 1050, streak: 0, rankChange: null },
  { rank: 6, studentId: 'mock-stu-06', username: 'sofia_r', avatarUrl: null, points: 980, streak: 2, rankChange: -3 },
  { rank: 7, studentId: 'mock-stu-07', username: 'tobias.w', avatarUrl: null, points: 910, streak: 0, rankChange: 1 },
  { rank: 8, studentId: 'mock-stu-08', username: 'nadia_k', avatarUrl: mockAvatar('#4ade80', 'NK'), points: 870, streak: 3, rankChange: 0 },
  { rank: 9, studentId: 'mock-stu-09', username: 'lars', avatarUrl: null, points: 720, streak: 0, rankChange: -2 },
  { rank: 10, studentId: 'mock-stu-10', username: 'emilia_h', avatarUrl: null, points: 690, streak: 1, rankChange: null },
  // From here on it is page 2 at PAGE_SIZE 10 — the signed-in student sits down here on purpose,
  // so the "Your position" strip under the table is visible on first load.
  { rank: 11, studentId: 'mock-stu-11', username: 'dmitri_s', avatarUrl: null, points: 540, streak: 5, rankChange: 4 },
  { rank: 12, studentId: 'mock-stu-12', username: 'you', avatarUrl: null, points: 410, streak: 2, rankChange: -6 },
  { rank: 13, studentId: 'mock-stu-13', username: 'carla_m', avatarUrl: null, points: 275, streak: 0, rankChange: 0 },
  // Enrolled but has never completed an activity. The real query must include this student
  // (roster from student_course, not from who has attempted something) rather than hide them.
  { rank: 14, studentId: 'mock-stu-14', username: 'newcomer', avatarUrl: null, points: 0, streak: 0, rankChange: null },
];

// A student's points are their cumulative score across every activity type (REQ-GAM-DL-1), not
// something earned per course — so a student in two courses carries the SAME number into both
// leaderboards, and only the field of competitors changes. streak is the same story (REQ-GAM-
// BL-2): one daily streak per student, not per course. These three rows therefore repeat the
// points and streak from the course above rather than inventing second, smaller totals.
const SOFTWARE_ARCHITECTURE: LeaderboardEntry[] = [
  { rank: 1, studentId: 'mock-stu-01', username: 'mkellner', avatarUrl: mockAvatar('#7c4dff', 'MK'), points: 1450, streak: 12, rankChange: -2 },
  { rank: 2, studentId: 'mock-stu-06', username: 'sofia_r', avatarUrl: null, points: 980, streak: 2, rankChange: 3 },
  { rank: 3, studentId: 'mock-stu-12', username: 'you', avatarUrl: null, points: 410, streak: 2, rankChange: 1 },
];

/** A course with a roster but no completed activity yet — exercises the table's empty state. */
const EMPTY_COURSE: LeaderboardEntry[] = [];

const BY_COURSE: Record<string, LeaderboardEntry[]> = {
  'mock-course-re': REQUIREMENTS_ENGINEERING,
  'mock-course-sa': SOFTWARE_ARCHITECTURE,
  'mock-course-empty': EMPTY_COURSE,
};

/**
 * Levels passed per activity type, in the fixed ACTIVITIES order, turned into the title rows
 * GET /api/students/{id}/titles would return. null means the activity type was never passed, and
 * such an entry is left out entirely — the real route only returns rows for activity types the
 * student has actually passed (REQ-GAM-BL-1.1), and buildMasteryTitleEntries fills in the rest.
 *
 * Title names come from ACTIVITIES rather than being typed out here, so the mock can't drift
 * from the strings the rest of the app shows.
 */
function titlesFor(levels: (number | null)[]): PublicStudentTitle[] {
  return ACTIVITIES.flatMap((activity, index) => {
    const level = levels[index] ?? null;
    if (level === null) return [];
    return [
      {
        activityType: activity.activityType,
        difficultyLevel: level,
        title: activity.titles[level as 1 | 2 | 3],
      },
    ];
  });
}

/**
 * The parts of a public profile that aren't already on the leaderboard row. username, avatarUrl
 * and score are NOT repeated here — getMockPublicProfile reads them off the leaderboard entry so
 * a profile can't contradict the table it was reached from.
 *
 * Deliberate edge cases: 'mock-stu-04' has an empty biography, and 'mock-stu-14' has passed
 * nothing at all, so the page's "no biography" and "no mastery titles yet" states are both
 * reachable by clicking a real row.
 */
const PROFILE_BIOS_AND_LEVELS: Record<string, { biography: string; levels: (number | null)[] }> = {
  'mock-stu-01': { biography: 'Fifth semester, mostly interested in how requirements go wrong before anyone writes code.', levels: [3, 3, 2] },
  'mock-stu-02': { biography: 'Trying to get through all three activities before the exam.', levels: [3, 2, 2] },
  'mock-stu-03': { biography: 'Working student, practising in the evenings.', levels: [2, 3, 1] },
  'mock-stu-04': { biography: '', levels: [2, 2, 2] },
  'mock-stu-05': { biography: 'Exchange semester. Requirements engineering is new to me.', levels: [3, 1, 2] },
  'mock-stu-06': { biography: 'I like the acceptance-criteria activities best.', levels: [2, 2, 1] },
  'mock-stu-07': { biography: 'Second attempt at this course. Going better this time.', levels: [2, 1, 2] },
  'mock-stu-08': { biography: 'Aiming for all three master titles.', levels: [2, 2, null] },
  'mock-stu-09': { biography: 'Just here to pass.', levels: [1, 2, 1] },
  'mock-stu-10': { biography: 'Interested in the AI feedback side of the app.', levels: [2, 1, 1] },
  'mock-stu-11': { biography: 'Part-time student, slow but steady.', levels: [1, 1, 1] },
  // Reachable only if someone else views this row — the signed-in student's own click is
  // answered by the page's "this is you" branch, which uses their real profile instead.
  'mock-stu-12': { biography: 'Placeholder biography for the signed-in student.', levels: [1, 1, null] },
  'mock-stu-13': { biography: 'Started late in the semester.', levels: [1, null, null] },
  'mock-stu-14': { biography: 'Just joined the course.', levels: [null, null, null] },
};

/** Every leaderboard row across all courses, first match wins — a student's identity and score
 *  are the same wherever they appear (see the SOFTWARE_ARCHITECTURE comment above). */
function findLeaderboardEntry(studentId: string): LeaderboardEntry | null {
  for (const entries of Object.values(BY_COURSE)) {
    const match = entries.find((entry) => entry.studentId === studentId);
    if (match) return match;
  }
  return null;
}

/**
 * One student's public profile, or null when no such student exists — which is what drives the
 * page's "Student not found" state.
 *
 * Never called with the signed-in student's own id in practice: getMockLeaderboard rewrites that
 * row's id to their real Supabase uuid, and the page answers that case from useUser() before it
 * gets here. The real GET /api/students/{id}/public-profile has no such split — it returns real
 * ids throughout, and the page's own-profile branch becomes a pure display choice rather than a
 * workaround for hardcoded ids.
 */
export function getMockPublicProfile(studentId: string): PublicStudentProfile | null {
  const extras = PROFILE_BIOS_AND_LEVELS[studentId];
  const entry = findLeaderboardEntry(studentId);
  if (!extras || !entry) return null;

  return {
    studentId,
    username: entry.username,
    avatarUrl: entry.avatarUrl,
    biography: extras.biography,
    score: entry.points,
    titles: titlesFor(extras.levels),
  };
}
