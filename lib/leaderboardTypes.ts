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
