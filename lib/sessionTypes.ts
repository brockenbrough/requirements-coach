// The shapes a session travels in over the wire, and the one place they are declared.
//
// This file deliberately imports nothing. That is what lets both sides of the app read from
// it: lib/sessionClient.ts ('use client') re-exports these for the UI, while lib/sessionQueries.ts
// and app/api/instructor/activities/route.ts build them on the server. A shared module that
// imported anything could drag server code — and with it the service-role key — into the browser
// bundle; one with no imports at all cannot.
//
// Not to be confused with lib/activityLogTypes.ts's ActivityLogEntry: that is the *display*
// shape the log UI renders, derived from these client-side by toActivityLogEntry.

/** One row of session_log, exactly as the routes disclose it. */
export type SessionRecord = {
  session_id: string;
  user_id: string;
  activity_type: string;
  difficulty_level: number;
  started_at: string;
  ended_at: string | null;
  status: string;
  cumulative_score: number;
  max_score: number;
  passed: boolean;
};

/** A session as the list endpoints return it: the record plus how far it got. */
export type SessionListEntry = SessionRecord & {
  questionCount: number;
  answeredCount: number;
  nextPosition: number | null;
};

/** One course a catalog is currently linked to via some assembled_quiz. */
export type ActivityCourseRef = { courseId: string; courseName: string };

/**
 * The same entry as returned by the class-wide instructor endpoint, plus who it belongs to
 * (GitHub #173). studentName is already a display name — the server derives it from first/last
 * name or username, so no caller has to know the profile's shape.
 */
export type InstructorActivityEntry = SessionListEntry & {
  studentId: string;
  studentName: string;
  /**
   * Every course this session's catalog is currently linked to via some assembled_quiz — GitHub
   * #474. Empty means "not linked to any course yet", not an error; a catalog can be linked to
   * more than one course at once, so this is a list, not a single name.
   */
  courses: ActivityCourseRef[];
  /**
   * The assembled quiz's own name (GitHub #500 follow-up) — not the catalog's, so two different
   * quizzes composed from the same catalog show up distinguishably. Null means the catalog isn't
   * linked to any assembled quiz yet, the same case courses: [] represents; toActivityLogEntry
   * falls back to the catalog lookup and then the raw key when this is null.
   */
  quizName: string | null;
};

/**
 * One session_log record plus who it belongs to, without progress (GitHub #115) — the leaner
 * counterpart to InstructorActivityEntry, for the route that only needs the record itself
 * (student, activity, level, start date, score, result), not how far in it the student got.
 */
export type InstructorSessionEntry = SessionRecord & {
  studentId: string;
  studentName: string;
};
