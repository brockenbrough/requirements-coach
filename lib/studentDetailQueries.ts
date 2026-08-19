// Query behind GET /api/instructor/students/{studentId}/detail — the Instructor Dashboard's
// per-student detail view (formerly lib/mockStudentAttempts.ts's fabricated data, same for every
// student regardless of which one was clicked).
//
// Scope is deliberately narrower than the other instructor student reads
// (GET /api/instructor/students/{id}/history, GET /api/instructor/activities): those either read
// every completed session for a student with no course filter, or scope by catalog ownership.
// This route scopes by the *pair* — only courses this instructor teaches AND this student is
// enrolled in — since a student can share zero, one, or several courses with a given instructor,
// and their attempts at another instructor's course must never surface here.

import type { SupabaseClient } from './sessionQueries';
import { loadProgressForSessions, type ActivityLogRow } from './sessionQueries';
import { SESSION_COLUMNS } from './sessionRules';
import { getEnrolledCourseIds, listOwnedCourseIds, loadEnrolledStudentIdsForCourses } from './courseQueries';
import { listActivityTypesForCourses, listCoursesForActivityTypes, type ActivityCourseRef } from './activityCourseQueries';
import { fetchAllRowsByIds } from './supabasePaging';

export type StudentDetailAttempt = ActivityLogRow & {
  /**
   * Per-question correctness, in presentation order, for however much of the session has been
   * answered so far — the same shape lib/mockStudentAttempts.ts's StudentAttemptDetail used,
   * kept so lib/studentAttemptMetrics.ts's streak calculation needs no changes. Empty for a
   * session with no per-question data yet (an llm-graded session has no boolean correctness to
   * report — it grades a whole submission, not individual questions).
   */
  questionResults: boolean[];
  /** Every course this attempt's catalog is linked to, filtered down to only the courses this
   *  student and this instructor actually share — never a course belonging to someone else. */
  courses: ActivityCourseRef[];
};

export type StudentDetailResult = {
  studentName: string;
  /** activity_type -> display name, for attempts on a custom (non-built-in) catalog. */
  activityNames: Record<string, string>;
  attempts: StudentDetailAttempt[];
  /**
   * Mean of each completed attempt's own percentage (cumulative_score / max_score), pooled across
   * every student enrolled in the shared courses and every activity type reachable through them —
   * the same definition lib/quizStatisticsQueries.ts's computeQuizStatistics already uses for
   * "class average", just pooled over more than one activity type at once. null only when nobody
   * in the shared courses (including this student) has completed anything yet.
   */
  classAveragePercent: number | null;
};

export type StudentDetailOutcome =
  | { status: 'ok'; detail: StudentDetailResult }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'error'; error: { message: string } };

function studentDisplayName(row: { first_name: string | null; last_name: string | null; username: string | null }): string {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return fullName || row.username || 'Unknown student';
}

type PositionRow = { session_id: string; position: number; question_id: string };
type AnsweredRow = { session_id: string; question_id: string; answer: { is_correct: boolean } | null };

/**
 * Per-session, per-question correctness in presentation order — session_to_question's own
 * ordering joined against answered_question_log's result (via submitted_option -> answer,
 * the same join lib/sessionQueries.ts's loadSessionAnswers uses to disclose correctness). Only
 * mcq-kind sessions have rows in session_to_question at all; an llm-graded session's id simply
 * never appears in positionsBySession, so it maps to [] below — a session with no per-question
 * concept, not an error.
 *
 * A question still awaiting an answer is left out of the result entirely (not padded with
 * `false`), matching StudentDetailAttempt's own doc: an in-progress session's unanswered tail
 * has no correctness to report yet.
 */
async function loadQuestionCorrectnessBySession(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<{ correctnessBySession: Map<string, boolean[]> | null; error: { message: string } | null }> {
  if (sessionIds.length === 0) return { correctnessBySession: new Map(), error: null };

  const [{ data: positionRows, error: positionError }, { data: answerRows, error: answerError }] = await Promise.all([
    fetchAllRowsByIds(sessionIds, (chunk, from, to) =>
      supabase.from('session_to_question').select('session_id, position, question_id').in('session_id', chunk).range(from, to),
    ),
    fetchAllRowsByIds(sessionIds, (chunk, from, to) =>
      supabase
        .from('answered_question_log')
        .select('session_id, question_id, answer:submitted_option ( is_correct )')
        .in('session_id', chunk)
        .range(from, to),
    ),
  ]);

  const error = positionError ?? answerError ?? null;
  if (error) return { correctnessBySession: null, error };

  const positionsBySession = new Map<string, PositionRow[]>();
  for (const row of (positionRows ?? []) as PositionRow[]) {
    const list = positionsBySession.get(row.session_id) ?? [];
    list.push(row);
    positionsBySession.set(row.session_id, list);
  }

  const correctByQuestionBySession = new Map<string, Map<string, boolean>>();
  for (const row of (answerRows ?? []) as unknown as AnsweredRow[]) {
    const byQuestion = correctByQuestionBySession.get(row.session_id) ?? new Map<string, boolean>();
    byQuestion.set(row.question_id, row.answer?.is_correct ?? false);
    correctByQuestionBySession.set(row.session_id, byQuestion);
  }

  const correctnessBySession = new Map<string, boolean[]>();
  for (const [sessionId, positions] of positionsBySession) {
    const answered = correctByQuestionBySession.get(sessionId) ?? new Map<string, boolean>();
    const ordered = [...positions].sort((a, b) => a.position - b.position).filter((row) => answered.has(row.question_id));
    correctnessBySession.set(sessionId, ordered.map((row) => answered.get(row.question_id)!));
  }

  return { correctnessBySession, error: null };
}

/**
 * One student's attempts, activity-name labels, and the class average — scoped to exactly the
 * courses `instructorId` teaches and `studentId` is enrolled in. See this file's header comment
 * for why that pairing, not "every course either of them touches", is the scope.
 *
 * 'not_found' vs 'forbidden' mirrors the 404-then-403 ordering the rest of the app's ownership
 * checks use (lib/courseQueries.ts's findOwnedCourse, GET /api/instructor/quizzes/{activityType}):
 * an id that isn't a real student at all is a 404; a real student this instructor simply doesn't
 * share a course with is a 403, so a caller cannot tell the two apart from the outside.
 */
export async function loadStudentDetailForInstructor(
  supabase: SupabaseClient,
  studentId: string,
  instructorId: string,
): Promise<StudentDetailOutcome> {
  const { data: studentRow, error: studentError } = await supabase
    .from('user')
    .select('user_id, first_name, last_name, username')
    .eq('user_id', studentId)
    .eq('role', 'student')
    .maybeSingle();

  if (studentError) return { status: 'error', error: studentError };
  if (!studentRow) return { status: 'not_found' };

  const studentName = studentDisplayName(
    studentRow as { first_name: string | null; last_name: string | null; username: string | null },
  );

  const [{ courseIds: ownedCourseIds, error: ownedError }, { courseIds: enrolledCourseIds, error: enrolledError }] = await Promise.all([
    listOwnedCourseIds(supabase, instructorId),
    getEnrolledCourseIds(supabase, studentId),
  ]);
  if (ownedError || !ownedCourseIds) return { status: 'error', error: ownedError! };
  if (enrolledError || !enrolledCourseIds) return { status: 'error', error: enrolledError! };

  const ownedSet = new Set(ownedCourseIds);
  const sharedCourseIds = enrolledCourseIds.filter((courseId) => ownedSet.has(courseId));
  if (sharedCourseIds.length === 0) return { status: 'forbidden' };

  const { activities: sharedActivities, error: activitiesError } = await listActivityTypesForCourses(supabase, sharedCourseIds);
  if (activitiesError || !sharedActivities) return { status: 'error', error: activitiesError! };

  const sharedActivityTypes = [...new Set(sharedActivities.map((activity) => activity.activityType))];
  const activityNames = Object.fromEntries(sharedActivities.map((activity) => [activity.activityType, activity.name]));

  if (sharedActivityTypes.length === 0) {
    return { status: 'ok', detail: { studentName, activityNames, attempts: [], classAveragePercent: null } };
  }

  const { data: sessionRows, error: sessionError } = await supabase
    .from('session_log')
    .select(SESSION_COLUMNS)
    .eq('user_id', studentId)
    .in('activity_type', sharedActivityTypes)
    .order('ended_at', { ascending: false })
    .order('started_at', { ascending: false });
  if (sessionError) return { status: 'error', error: sessionError };

  type SessionRow = Omit<ActivityLogRow, 'questionCount' | 'answeredCount' | 'nextPosition'>;
  const sessions = (sessionRows ?? []) as SessionRow[];
  const sessionIds = sessions.map((session) => session.session_id);

  const [
    { progress, error: progressError },
    { correctnessBySession, error: correctnessError },
    { coursesByActivityType, error: coursesError },
    { studentIds: rosterIds, error: rosterError },
  ] = await Promise.all([
    loadProgressForSessions(supabase, sessionIds),
    loadQuestionCorrectnessBySession(supabase, sessionIds),
    listCoursesForActivityTypes(supabase, sharedActivityTypes),
    loadEnrolledStudentIdsForCourses(supabase, sharedCourseIds),
  ]);
  if (progressError) return { status: 'error', error: progressError };
  if (correctnessError) return { status: 'error', error: correctnessError };
  if (coursesError) return { status: 'error', error: coursesError };
  if (rosterError || !rosterIds) return { status: 'error', error: rosterError! };

  const sharedCourseIdSet = new Set(sharedCourseIds);

  const attempts: StudentDetailAttempt[] = sessions.map((session) => {
    const sessionProgress = progress!.get(session.session_id);
    const courses = (coursesByActivityType!.get(session.activity_type) ?? []).filter((course) => sharedCourseIdSet.has(course.courseId));

    return {
      ...session,
      questionCount: sessionProgress?.questionCount ?? 0,
      answeredCount: sessionProgress?.answeredCount ?? 0,
      nextPosition: sessionProgress?.nextPosition ?? null,
      questionResults: correctnessBySession!.get(session.session_id) ?? [],
      courses,
    };
  });

  const { data: classSessionRows, error: classSessionError } = await supabase
    .from('session_log')
    .select('cumulative_score, max_score')
    .in('user_id', rosterIds)
    .in('activity_type', sharedActivityTypes)
    .eq('status', 'completed');
  if (classSessionError) return { status: 'error', error: classSessionError };

  const classRows = (classSessionRows ?? []) as { cumulative_score: number; max_score: number }[];
  const classAveragePercent =
    classRows.length === 0
      ? null
      : Math.round(
          classRows.reduce((sum, row) => sum + (row.max_score > 0 ? (row.cumulative_score / row.max_score) * 100 : 0), 0) /
            classRows.length,
        );

  return { status: 'ok', detail: { studentName, activityNames, attempts, classAveragePercent } };
}
