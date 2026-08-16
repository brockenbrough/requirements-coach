// A catalog (activity_type) has no course of its own — activity_type_course, the table that used
// to tie one directly to a course, is gone (see supabase/schema.sql's migration notes). A catalog
// is reachable by a student only transitively: Course -> assembled_quiz (GitHub #360) ->
// assembled_quiz_catalog -> the catalog. This file still answers "which course(s) can see this
// activity" and "can this user see it" — only how it derives the answer changed, from a direct
// join-table lookup to a derived one through the quiz-composition tables.

import type { SupabaseClient } from './sessionQueries';
import { getEnrolledCourseIds } from './courseQueries';

export type ActivityCourseLink = { courseId: string; courseName: string };

type GrantingQuizRow = { assembled_quiz: { course_id: string; course: { course_name: string } | null } | null };

/**
 * One course, among the caller's own enrolled courses, that grants access to `activityType`
 * through some assembled_quiz — or null if none does. There can be more than one (the same
 * catalog can be composed into quizzes in several of the caller's courses); this returns
 * whichever the query finds first, which is enough for both existing callers below
 * (checkActivityAccess only needs a yes/no, and GET /api/activities/{activityType} only needs
 * *a* valid course to answer with, not an exhaustive list).
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
    .select('assembled_quiz:assembled_quiz_id!inner(course_id, course:course_id(course_name))')
    .eq('activity_type', activityType)
    .in('assembled_quiz.course_id', courseIds)
    .limit(1);

  if (error) return { link: null, error };

  const row = ((data ?? []) as unknown as GrantingQuizRow[])[0];
  if (!row?.assembled_quiz) return { link: null, error: null };

  return {
    link: { courseId: row.assembled_quiz.course_id, courseName: row.assembled_quiz.course?.course_name ?? 'Unknown course' },
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
  courseId: string;
  courseName: string;
};

type DiscoveryRow = {
  activity_type: string;
  catalog: { quiz_name: string; description: string | null } | null;
  assembled_quiz: { course_id: string; course: { course_name: string } | null } | null;
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
 * used to fill in courseId/courseName (display-only fields; access itself doesn't depend on which
 * one is picked, only that at least one exists).
 */
export async function listActivityTypesForCourses(
  supabase: SupabaseClient,
  courseIds: string[],
): Promise<{ activities: CourseActivitySummary[] | null; error: { message: string } | null }> {
  if (courseIds.length === 0) return { activities: [], error: null };

  const { data, error } = await supabase
    .from('assembled_quiz_catalog')
    .select(
      'activity_type, catalog:activity_type(quiz_name, description), assembled_quiz:assembled_quiz_id!inner(course_id, course:course_id(course_name))',
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
      name: row.catalog?.quiz_name ?? row.activity_type,
      description: row.catalog?.description ?? null,
      courseId: row.assembled_quiz.course_id,
      courseName: row.assembled_quiz.course?.course_name ?? 'Unknown course',
    });
  }

  return { activities, error: null };
}
