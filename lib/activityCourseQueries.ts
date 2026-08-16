// Ties every activity_type to exactly one course (activity_type_course) — see that table's own
// header comment in supabase/schema.sql for why this is a join table with a uniqueness
// constraint rather than a course_id column on activity_type itself. This file is the one place
// that defines "which course does this activity belong to" and "can this user see it", the same
// role lib/courseQueries.ts plays for course/student_course itself.

import type { SupabaseClient } from './sessionQueries';
import { isEnrolledInAnyCourse } from './courseQueries';
import { isGradingKind, type GradingKind } from './activityTypes';

export type ActivityCourseLink = { courseId: string; courseName: string };

/**
 * Links a newly created activity_type to a course. Called immediately after the activity_type
 * insert in POST /api/activities/types — on failure the caller deletes the activity_type row it
 * just inserted, the same hand-rolled-rollback shape createAssembledQuiz
 * (lib/assembledQuizQueries.ts) uses for its own quiz+links insert, since an activity with no
 * course is not a valid end state under this rule. A 23505 here means the activityType is
 * already linked (uq_activity_type_course_activity_type) — surfaced as-is so the caller can
 * report a clear conflict rather than a generic 500.
 */
export async function linkActivityTypeToCourse(
  supabase: SupabaseClient,
  params: { activityType: string; courseId: string },
) {
  const { error } = await supabase
    .from('activity_type_course')
    .insert({ activity_type: params.activityType, course_id: params.courseId });

  return { error };
}

/**
 * The one course an activity_type is linked to, or null if it hasn't been linked to any yet —
 * "not yet available to any student" per activity_type_course's own header comment, not an
 * error. maybeSingle is safe here specifically because uq_activity_type_course_activity_type
 * guarantees at most one row can ever match.
 */
export async function getCourseForActivityType(supabase: SupabaseClient, activityType: string) {
  const { data, error } = await supabase
    .from('activity_type_course')
    .select('course_id, course:course_id(course_name)')
    .eq('activity_type', activityType)
    .maybeSingle();

  if (error) return { link: null, error };
  if (!data) return { link: null, error: null };

  const row = data as unknown as { course_id: string; course: { course_name: string } | null };
  return { link: { courseId: row.course_id, courseName: row.course?.course_name ?? 'Unknown course' } as ActivityCourseLink, error: null };
}

export type ActivityAccessResult =
  | { status: 'ok' }
  | { status: 'forbidden' }
  | { status: 'error'; error: { message: string } };

/**
 * Whether a user can see/play a given activity: it must be linked to a course, and the user must
 * be enrolled in that course. Reuses isEnrolledInAnyCourse (lib/courseQueries.ts) — the same
 * membership primitive GET /api/courses/{courseId}/leaderboard and GET /api/students/{id}/
 * public-profile already share — with a single-course list, so "enrolled" can't drift between
 * routes.
 *
 * An activity that exists but has no course link at all collapses into the same 'forbidden'
 * outcome as one linked to a course the caller isn't in — from the caller's point of view both
 * are simply "not available to you", and distinguishing them would only leak which activities
 * exist unlinked.
 */
export async function checkActivityAccess(
  supabase: SupabaseClient,
  activityType: string,
  userId: string,
): Promise<ActivityAccessResult> {
  const { link, error: linkError } = await getCourseForActivityType(supabase, activityType);
  if (linkError) return { status: 'error', error: linkError };
  if (!link) return { status: 'forbidden' };

  const { enrolled, error: enrollError } = await isEnrolledInAnyCourse(supabase, userId, [link.courseId]);
  if (enrollError) return { status: 'error', error: enrollError };

  return enrolled ? { status: 'ok' } : { status: 'forbidden' };
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

/**
 * Every activity_type linked to any of the given courses — the query behind the student
 * discovery route (GET /api/activities) and, given a single-course list, an instructor's
 * per-course catalog view. courseIds: [] short-circuits to an empty list without a query,
 * matching isEnrolledInAnyCourse's own empty-input handling.
 */
export async function listActivityTypesForCourses(
  supabase: SupabaseClient,
  courseIds: string[],
): Promise<{ activities: CourseActivitySummary[] | null; error: { message: string } | null }> {
  if (courseIds.length === 0) return { activities: [], error: null };

  const { data, error } = await supabase
    .from('activity_type_course')
    .select('activity_type, course_id, course:course_id(course_name), catalog:activity_type(quiz_name, description, grading_kind)')
    .in('course_id', courseIds);

  if (error) return { activities: null, error };

  type Row = {
    activity_type: string;
    course_id: string;
    course: { course_name: string } | null;
    catalog: { quiz_name: string; description: string | null; grading_kind: string } | null;
  };

  const activities: CourseActivitySummary[] = ((data ?? []) as unknown as Row[]).map((row) => ({
    activityType: row.activity_type,
    name: row.catalog?.quiz_name ?? row.activity_type,
    description: row.catalog?.description ?? null,
    // Same 'mcq' fallback as lib/activityTypeQueries.ts's gradingKindOf, for the same reason: the
    // column defaults to 'mcq' because every activity_type predating it drew from question/answer.
    gradingKind: isGradingKind(row.catalog?.grading_kind) ? row.catalog.grading_kind : 'mcq',
    courseId: row.course_id,
    courseName: row.course?.course_name ?? 'Unknown course',
  }));

  return { activities, error: null };
}
