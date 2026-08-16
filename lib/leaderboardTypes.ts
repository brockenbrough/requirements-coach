// Row shapes for the course leaderboard, shared by the UI and — once the real route exists —
// by GET /api/courses/{courseId}/leaderboard. Imports nothing, so a server route can use these
// without pulling in a 'use client' module; same reason lib/sessionTypes.ts is its own file.
//
// No REQ id to cite yet: docs/requirements/requirements.md has no leaderboard requirement at all
// (its gamification chapter is entirely single-player, and line 207 argues against making the app
// feel like a game). Proposed ids once the spec catches up: REQ-GAM-DL-3 / BL-2 / PL-3.

/** One student's line in a course leaderboard, already ranked by the server. */
export type LeaderboardEntry = {
  /**
   * Standard competition ranking: ties share a rank and the next rank skips (1, 2, 2, 4).
   * Assigned server-side so the client never re-ranks and two requests can't disagree
   * about who is second.
   */
  rank: number;
  studentId: string;
  username: string;
  /** Public Supabase Storage URL from "user".avatar_url, or null — render initials instead. */
  avatarUrl: string | null;
  /** Cumulative score, same definition as computeStudentScore (lib/scoreQueries.ts). */
  points: number;
  /**
   * Current daily streak in days, same definition as computeStudentStreak
   * (lib/streakQueries.ts, GitHub #307) — consecutive calendar days (UTC) with at least one
   * completed, passed session_log row, allowing up to a 36h gap between two chronologically
   * consecutive passed activities. 0 means no active streak; StreakBadge renders nothing for it
   * rather than a flame with a "0".
   */
  streak: number;
  /**
   * Ranks gained since this student last viewed the leaderboard: positive = moved up,
   * negative = moved down, 0 = unchanged, null = no previous ranking on record.
   *
   * Derived on the client from lib/previousRankStore.ts, not from the server — there is no
   * historical snapshot in the database. It therefore means "since your last visit on this
   * device", not "since yesterday". See that store's header for the limits.
   */
  rankChange: number | null;
};

/** A course the signed-in student can view a leaderboard for. */
export type LeaderboardCourse = {
  courseId: string;
  courseName: string;
};

/**
 * One mastery title, in exactly the shape GET /api/students/{id}/titles already returns.
 *
 * Re-declared here rather than imported from lib/sessionClient.ts, which is 'use client' — this
 * file has to stay importable from a server route. lib/masteryTitles.ts's StudentTitle is the
 * same three fields, so buildMasteryTitleEntries takes this without a cast.
 */
export type PublicStudentTitle = {
  activityType: string;
  difficultyLevel: number | null;
  title: string | null;
};

/**
 * One activity type's full earnable title ladder, in exactly the shape
 * lib/titleQueries.ts's loadAvailableTitleLadders returns. Re-declared here for the same reason
 * PublicStudentTitle is above — this file stays import-free so a server route can use it without
 * pulling in anything else.
 */
export type AvailableActivityTitles = {
  activityType: string;
  activityName: string;
  courseId: string;
  courseName: string;
  titles: { difficultyLevel: number; title: string | null }[];
};

/**
 * Everything a student may see about a classmate, and nothing else.
 *
 * This type is the privacy contract in code form: US-5's
 * GET /api/students/{id}/public-profile must return these fields and no others. Notably absent,
 * and deliberately so, are first_name/last_name, age, semester, email, the student's courses,
 * and anything about individual answers or attempts — all of which exist on the "user" row or a
 * join away from it, and none of which a peer has a reason to see.
 *
 * titles and availableTitles both stay in the raw API shape rather than a pre-built
 * MasteryTitleEntry[] so that lib/masteryTitles.ts remains the single place that reconciles the
 * two into a display-ready progression.
 */
export type PublicStudentProfile = {
  studentId: string;
  username: string;
  avatarUrl: string | null;
  /** May be empty — "user".biography is NOT NULL but nothing forces it non-blank. */
  biography: string;
  /** Cumulative score, same definition as computeStudentScore (lib/scoreQueries.ts). */
  score: number;
  titles: PublicStudentTitle[];
  /** The target's full earnable title ladder — lib/titleQueries.ts's loadAvailableTitleLadders. */
  availableTitles: AvailableActivityTitles[];
};
