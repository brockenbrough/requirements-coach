// A catalog (activity_type) has no course of its own — activity_type_course, the table that used
// to tie one directly to a course, is gone (see supabase/schema.sql's migration notes). A catalog
// is reachable by a student only transitively: Course -> assembled_quiz (GitHub #360) ->
// assembled_quiz_catalog -> the catalog. This file still answers "which course(s) can see this
// activity" and "can this user see it" — only how it derives the answer changed, from a direct
// join-table lookup to a derived one through the quiz-composition tables.

import type { SupabaseClient } from './sessionQueries';
import { getEnrolledCourseIds } from './courseQueries';
import { isGradingKind, type GradingKind } from './activityTypes';

export type ActivityCourseLink = {
  courseId: string;
  courseName: string;
  name: string;
  description: string | null;
  assembledQuizId: string;
  /** GitHub #416: this quiz's own per-level draw size — see assembled_quiz.questions_per_level's
   *  own comment in supabase/schema.sql. NOT NULL in the schema, same as assembledQuizId above;
   *  callers still fall back to QUESTIONS_PER_SESSION via `??` for the rare case this comes back
   *  missing. */
  questionsPerLevel: number;
};

type GrantingQuizRow = {
  assembled_quiz: {
    assembled_quiz_id: string;
    course_id: string;
    quiz_name: string;
    description: string | null;
    questions_per_level: number;
    course: { course_name: string } | null;
  } | null;
  catalog: { quiz_name: string; description: string | null } | null;
};

/**
 * One course, among the caller's own enrolled courses, that grants access to `activityType`
 * through some assembled_quiz — or null if none does. There can be more than one (the same
 * catalog can be composed into quizzes in several of the caller's courses); this returns
 * whichever the query finds first, which is enough for both existing callers below
 * (checkActivityAccess only needs a yes/no, and GET /api/activities/{activityType} needs a valid
 * course plus display name/description to answer with, not an exhaustive list).
 *
 * name/description prefer the assembled quiz's own (what the instructor actually called it for
 * this course) over the underlying catalog's — the catalog embed rides along on the same query
 * (this function already filters by activity_type, so it's the same row, not a second round
 * trip) purely as a fallback for assembled_quiz.description being nullable; assembled_quiz's own
 * quiz_name is NOT NULL, so its catalog fallback is defensive rather than a reachable path.
 *
 * assembledQuizId is also returned (not just used to derive display fields): POST /api/sessions
 * and GET /api/activities/{activityType}/questions both need it to know which quiz's
 * quiz_excluded_question/assembled_quiz_extra_question rows apply to the draw pool they build —
 * "which course grants access" and "which quiz's composition governs the draw" are answered by
 * the same row, so there is no reason to make either caller resolve it a second time. GitHub
 * #416's questionsPerLevel rides along for the same reason: POST /api/sessions needs the granting
 * quiz's own draw size, not a second lookup for it.
 *
 * Two queries (enrolled course ids, then the quiz-catalog join filtered to them) rather than one
 * three-way join, matching the shape getCourseForActivityType + isEnrolledInAnyCourse used to
 * have as two separate calls — no round-trip regression, just a different second query.
 */
export async function getAccessibleCourseForActivity(
  supabase: SupabaseClient,
  activityType: string,
  userId: string,
): Promise<{ link: ActivityCourseLink | null; error: { message: string } | null }> {
  const { courseIds, error: courseIdsError } = await getEnrolledCourseIds(supabase, userId);
  if (courseIdsError || !courseIds) return { link: null, error: courseIdsError };
  if (courseIds.length === 0) return { link: null, error: null };

  const { data, error } = await supabase
    .from('assembled_quiz_catalog')
    .select(
      'assembled_quiz:assembled_quiz_id!inner(assembled_quiz_id, course_id, quiz_name, description, questions_per_level, course:course_id(course_name)), catalog:activity_type(quiz_name, description)',
    )
    .eq('activity_type', activityType)
    .in('assembled_quiz.course_id', courseIds)
    .limit(1);

  if (error) return { link: null, error };

  const row = ((data ?? []) as unknown as GrantingQuizRow[])[0];
  if (!row?.assembled_quiz) return { link: null, error: null };

  return {
    link: {
      courseId: row.assembled_quiz.course_id,
      courseName: row.assembled_quiz.course?.course_name ?? 'Unknown course',
      name: row.assembled_quiz.quiz_name ?? row.catalog?.quiz_name ?? activityType,
      description: row.assembled_quiz.description ?? row.catalog?.description ?? null,
      assembledQuizId: row.assembled_quiz.assembled_quiz_id,
      questionsPerLevel: row.assembled_quiz.questions_per_level,
    },
    error: null,
  };
}

export type ActivityAccessResult =
  | { status: 'ok' }
  | { status: 'forbidden' }
  | { status: 'error'; error: { message: string } };

/**
 * Whether a user can see/play a given activity: it must be reachable through an assembled_quiz
 * belonging to a course the user is enrolled in (getAccessibleCourseForActivity above). A catalog
 * reachable through no quiz at all, or only through quizzes in courses the caller isn't in,
 * collapses to the same 'forbidden' outcome — from the caller's point of view both just mean "not
 * available to you," and distinguishing them would leak which catalogs/quizzes exist otherwise.
 */
export async function checkActivityAccess(
  supabase: SupabaseClient,
  activityType: string,
  userId: string,
): Promise<ActivityAccessResult> {
  const { link, error } = await getAccessibleCourseForActivity(supabase, activityType, userId);
  if (error) return { status: 'error', error };
  return link ? { status: 'ok' } : { status: 'forbidden' };
}

export type CourseActivitySummary = {
  activityType: string;
  name: string;
  description: string | null;
  /** GitHub #379: which play flow this activity uses — 'mcq' goes through POST /api/sessions,
   *  'llm-graded' through the free-text session routes. This is the field the student pages
   *  branch on, so it has to survive the trip from activity_type all the way to
   *  buildCustomActivityDefinition; without it a custom LLM catalog would resolve into the MCQ
   *  flow and fail at the draw. */
  gradingKind: GradingKind;
  courseId: string;
  courseName: string;
};

type DiscoveryRow = {
  activity_type: string;
  catalog: { quiz_name: string; description: string | null; grading_kind: string } | null;
  assembled_quiz: {
    course_id: string;
    quiz_name: string;
    description: string | null;
    course: { course_name: string } | null;
  } | null;
};

/**
 * Every activity_type reachable through some assembled_quiz belonging to any of the given
 * courses — the query behind the student discovery route (GET /api/activities). courseIds: []
 * short-circuits to an empty list without a query, matching isEnrolledInAnyCourse's own
 * empty-input handling.
 *
 * A catalog composed into more than one quiz across the given courses appears only once here,
 * keyed by activityType — the caller's discovery list shows one card per catalog, not one per
 * quiz that happens to include it, so the first quiz/course found for a given catalog is what's
 * used to fill in every display field (courseId/courseName/name/description; access itself
 * doesn't depend on which one is picked, only that at least one exists).
 *
 * name/description prefer the assembled quiz's own quiz_name/description — what the instructor
 * actually called it for this course — over the underlying catalog's, falling back to the
 * catalog's only when the assembled quiz doesn't have one (real for description, which is
 * nullable; effectively unreachable for quiz_name, which is NOT NULL, but free to keep since the
 * catalog embed is already fetched here for grading_kind).
 */
export async function listActivityTypesForCourses(
  supabase: SupabaseClient,
  courseIds: string[],
): Promise<{ activities: CourseActivitySummary[] | null; error: { message: string } | null }> {
  if (courseIds.length === 0) return { activities: [], error: null };

  const { data, error } = await supabase
    .from('assembled_quiz_catalog')
    .select(
      'activity_type, catalog:activity_type(quiz_name, description, grading_kind), assembled_quiz:assembled_quiz_id!inner(course_id, quiz_name, description, course:course_id(course_name))',
    )
    .in('assembled_quiz.course_id', courseIds);

  if (error) return { activities: null, error };

  const seen = new Set<string>();
  const activities: CourseActivitySummary[] = [];

  for (const row of (data ?? []) as unknown as DiscoveryRow[]) {
    if (!row.assembled_quiz || seen.has(row.activity_type)) continue;
    seen.add(row.activity_type);

    activities.push({
      activityType: row.activity_type,
      name: row.assembled_quiz.quiz_name ?? row.catalog?.quiz_name ?? row.activity_type,
      description: row.assembled_quiz.description ?? row.catalog?.description ?? null,
      // Same 'mcq' fallback as lib/activityTypeQueries.ts's gradingKindOf, for the same reason: the
      // column defaults to 'mcq' because every activity_type predating it drew from question/answer.
      gradingKind: isGradingKind(row.catalog?.grading_kind) ? row.catalog.grading_kind : 'mcq',
      courseId: row.assembled_quiz.course_id,
      courseName: row.assembled_quiz.course?.course_name ?? 'Unknown course',
    });
  }

  return { activities, error: null };
}

export type ActivityCourseRef = { courseId: string; courseName: string };

type ActivityCourseLinkRow = {
  activity_type: string;
  assembled_quiz: { course_id: string; quiz_name: string; course: { course_name: string } | null } | null;
};

/**
 * The reverse direction of listActivityTypesForCourses above: given a set of activity_types
 * (catalogs), every course each one is currently linked to — GitHub #474, the Instructor
 * Dashboard's activity log needing to show which course a student's attempt belongs to.
 *
 * Deliberately does NOT collapse to one course per catalog the way listActivityTypesForCourses
 * does: that function picks the first course/quiz found because it's answering "does this catalog
 * belong to (at least) one of these courses" for student-facing access, where any one match is
 * enough. This function's callers show the course(s) *to an instructor reviewing a specific
 * attempt*, and a catalog composed into more than one course's assembled_quiz is a real,
 * unremarkable case (assembled_quiz_catalog has no uniqueness constraint on activity_type) — so
 * every distinct course is kept, not just the first.
 *
 * A catalog with no assembled_quiz link at all simply has no entry in the returned map; callers
 * treat a missing key (or an empty array) as "no course assigned" rather than an error.
 *
 * activityTypes: [] short-circuits to an empty map without a query, same convention as
 * listActivityTypesForCourses's courseIds: [] handling.
 *
 * quizNameByActivityType (GitHub #500 follow-up) rides along on the same query and row set: an
 * attempt's ACTIVITY/QUIZ column used to show the catalog's raw activity_type key (via
 * toActivityLogEntry's getActivityByType-else-key fallback, which only knows the three built-in
 * catalogs) instead of a real name — indistinguishable for two different quizzes composed from
 * the same catalog. Same "first match wins" convention as listActivityTypesForCourses above for a
 * catalog linked to more than one quiz — there is no assembled_quiz_id on session_log to say which
 * one actually granted a given attempt access (see CLAUDE.md's GitHub #476 section for why that's
 * a hard data-model limit, not a shortcut taken here) — but the common case (one quiz per catalog)
 * resolves exactly right, and every case beats showing the raw key.
 */
export async function listCoursesForActivityTypes(
  supabase: SupabaseClient,
  activityTypes: string[],
): Promise<{
  coursesByActivityType: Map<string, ActivityCourseRef[]> | null;
  quizNameByActivityType: Map<string, string> | null;
  error: { message: string } | null;
}> {
  if (activityTypes.length === 0) {
    return { coursesByActivityType: new Map(), quizNameByActivityType: new Map(), error: null };
  }

  const { data, error } = await supabase
    .from('assembled_quiz_catalog')
    .select('activity_type, assembled_quiz:assembled_quiz_id!inner(course_id, quiz_name, course:course_id(course_name))')
    .in('activity_type', activityTypes);

  if (error) return { coursesByActivityType: null, quizNameByActivityType: null, error };

  const coursesByActivityType = new Map<string, ActivityCourseRef[]>();
  const quizNameByActivityType = new Map<string, string>();

  for (const row of (data ?? []) as unknown as ActivityCourseLinkRow[]) {
    if (!row.assembled_quiz) continue;

    const courseId = row.assembled_quiz.course_id;
    const courseName = row.assembled_quiz.course?.course_name ?? 'Unknown course';

    const existing = coursesByActivityType.get(row.activity_type) ?? [];
    if (!existing.some((course) => course.courseId === courseId)) existing.push({ courseId, courseName });
    coursesByActivityType.set(row.activity_type, existing);

    if (!quizNameByActivityType.has(row.activity_type)) {
      quizNameByActivityType.set(row.activity_type, row.assembled_quiz.quiz_name);
    }
  }

  return { coursesByActivityType, quizNameByActivityType, error: null };
}
