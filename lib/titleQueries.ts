// Shared logic for computing a student's mastery titles from session history (REQ-GAM-BL-1),
// so the student-facing titles route and any future consumer (e.g. the "new title earned"
// notification from REQ-GAM-PL-2.4) cannot drift apart.

import { highestPassedLevelByType, MAX_DIFFICULTY_LEVEL, type PassedSessionRow } from './sessionRules';
import type { SupabaseClient } from './sessionQueries';
import { listActivityTypesForCourses } from './activityCourseQueries';

export type StudentTitle = {
  activityType: string;
  difficultyLevel: number | null;
  title: string | null;
};

type SessionRow = PassedSessionRow;
type TitleDefinitionRow = { activity_type: string; difficulty_level: number; title_name: string };

const NOT_STARTED = 'Not yet started';

/**
 * One entry per activity type the student has attempted (any session_log row, any status), each
 * carrying the highest difficulty level passed and the title looked up from title_definition
 * (REQ-GAM-BL-1.1). An activity type with no passed session gets "Not yet started" instead of
 * being omitted. A student with no session history at all gets [].
 */
export async function computeStudentTitles(supabase: SupabaseClient, userId: string) {
  const [{ data: sessionRows, error: sessionError }, { data: titleRows, error: titleError }] =
    await Promise.all([
      supabase.from('session_log').select('activity_type, difficulty_level, passed').eq('user_id', userId),
      supabase.from('title_definition').select('activity_type, difficulty_level, title_name'),
    ]);

  const error = sessionError ?? titleError ?? null;
  if (error) return { titles: null, error };

  const sessions = (sessionRows ?? []) as SessionRow[];
  const titleDefinitions = (titleRows ?? []) as TitleDefinitionRow[];

  const titleByKey = new Map(
    titleDefinitions.map((row) => [`${row.activity_type}:${row.difficulty_level}`, row.title_name]),
  );

  const attempted = new Set(sessions.map((row) => row.activity_type));

  const highestPassed = highestPassedLevelByType(sessions);

  // GitHub #347: activity types are no longer a fixed compile-time list (instructors can create
  // their own quizzes), so "canonical order" is now alphabetical rather than a hardcoded array's
  // declaration order — still deterministic regardless of session_log row order, and unlike the
  // old ACTIVITY_TYPES.filter(...) it no longer silently drops an attempted type that isn't one
  // of the three built-ins.
  const titles: StudentTitle[] = [...attempted].sort().map((activityType) => {
    const level = highestPassed.get(activityType) ?? null;
    const title = level === null ? NOT_STARTED : titleByKey.get(`${activityType}:${level}`) ?? null;
    return { activityType, difficultyLevel: level, title };
  });

  return { titles, error: null };
}

/** One difficulty level's earnable title within an activity type's ladder — null if no title_definition row exists for it yet. */
export type TitleLadderRung = { difficultyLevel: number; title: string | null };

/**
 * One activity type's full earnable title ladder (every difficulty level, not just the one a
 * student has reached), replacing the compile-time-fixed ladder that used to live on
 * ActivityDefinition.titles (lib/activityContent.ts). Course metadata is carried alongside since
 * this is always built from a course-scoped activity list (see loadAvailableTitleLadders below).
 */
export type AvailableActivityTitles = {
  activityType: string;
  activityName: string;
  courseId: string;
  courseName: string;
  titles: TitleLadderRung[];
};

/**
 * Every activity type linked to any of the given courses, each with its full title_definition
 * ladder (levels 1..MAX_DIFFICULTY_LEVEL) — "all titles you can earn" for whoever those courses
 * belong to. Callers already have courseIds on hand for their own reasons (a student's own
 * enrollments for the self-only route, or the target's enrollments already fetched for the
 * shared-course check on the public-profile route), so this takes the id list directly rather
 * than a userId, avoiding a second getEnrolledCourseIds read in either case.
 *
 * A level with no title_definition row yet (a freshly created custom quiz, or
 * WRITE_ACCEPTANCE_CRITERIA today) gets title: null rather than being omitted — callers decide
 * how to render that gap (lib/masteryTitles.ts falls back to a generic "Level N" label, the same
 * placeholder buildCustomActivityDefinition used to hardcode).
 */
export async function loadAvailableTitleLadders(supabase: SupabaseClient, courseIds: string[]) {
  const { activities: courseActivities, error: activitiesError } = await listActivityTypesForCourses(
    supabase,
    courseIds,
  );
  if (activitiesError || !courseActivities) return { activities: null, error: activitiesError };
  if (courseActivities.length === 0) return { activities: [], error: null };

  const activityTypes = courseActivities.map((activity) => activity.activityType);
  const { data: titleRows, error: titleError } = await supabase
    .from('title_definition')
    .select('activity_type, difficulty_level, title_name')
    .in('activity_type', activityTypes);

  if (titleError) return { activities: null, error: titleError };

  const titleByKey = new Map(
    ((titleRows ?? []) as TitleDefinitionRow[]).map((row) => [`${row.activity_type}:${row.difficulty_level}`, row.title_name]),
  );

  const activities: AvailableActivityTitles[] = courseActivities.map((activity) => ({
    activityType: activity.activityType,
    activityName: activity.name,
    courseId: activity.courseId,
    courseName: activity.courseName,
    titles: Array.from({ length: MAX_DIFFICULTY_LEVEL }, (_, index) => {
      const difficultyLevel = index + 1;
      return { difficultyLevel, title: titleByKey.get(`${activity.activityType}:${difficultyLevel}`) ?? null };
    }),
  }));

  return { activities, error: null };
}
