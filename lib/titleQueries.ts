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
type IdentifiedTitleDefinitionRow = TitleDefinitionRow & { title_definition_id: string };

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

/**
 * One difficulty level's earnable title within an activity type's ladder — title is null if no
 * title_definition row exists for it yet, and titleDefinitionId is null in exactly the same case.
 *
 * The id travels with the name because a student can choose one of these as the title shown next
 * to their name ("user".selected_title_definition_id), and that choice is stored by id, not text.
 * A rung with a null title is therefore not selectable: there is nothing to wear and no row to
 * point at. Consumers must not substitute a generic "Level N" string for a missing title — that
 * placeholder is a rendering decision, and baking it in here is what made the ladder display
 * "Level 1" twice per rung (see components/TitleProgressionTrack.tsx).
 */
export type TitleLadderRung = { difficultyLevel: number; titleDefinitionId: string | null; title: string | null };

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
    .select('title_definition_id, activity_type, difficulty_level, title_name')
    .in('activity_type', activityTypes);

  if (titleError) return { activities: null, error: titleError };

  const rungByKey = new Map(
    ((titleRows ?? []) as IdentifiedTitleDefinitionRow[]).map((row) => [
      `${row.activity_type}:${row.difficulty_level}`,
      { id: row.title_definition_id, name: row.title_name },
    ]),
  );

  const activities: AvailableActivityTitles[] = courseActivities.map((activity) => ({
    activityType: activity.activityType,
    activityName: activity.name,
    courseId: activity.courseId,
    courseName: activity.courseName,
    titles: Array.from({ length: MAX_DIFFICULTY_LEVEL }, (_, index) => {
      const difficultyLevel = index + 1;
      const rung = rungByKey.get(`${activity.activityType}:${difficultyLevel}`);
      return { difficultyLevel, titleDefinitionId: rung?.id ?? null, title: rung?.name ?? null };
    }),
  }));

  return { activities, error: null };
}

/**
 * May this student wear this title? Answered against session_log, never against the request —
 * the id arrives in a PATCH /api/profile body, so the client saying "this is mine" proves
 * nothing. A title is wearable when the student has passed the difficulty level its
 * title_definition row is defined for, in that row's activity type.
 *
 * The check reduces the student's sessions with highestPassedLevelByType (lib/sessionRules.ts) —
 * the same reducer computeStudentTitles above and findStartDifficultyLevel already use — so
 * "earned" cannot come to mean one thing on the profile page's dropdown and another here.
 *
 * Course enrollment is deliberately NOT re-checked: a title is earned by passing a level, and
 * leaving the course afterwards doesn't unearn it. The dropdown is course-scoped only because
 * it's built from available-titles, which is a discovery list, not a permission list.
 */
export async function canWearTitle(
  supabase: SupabaseClient,
  userId: string,
  titleDefinitionId: string,
): Promise<{ ok: boolean; reason: string | null; error: { message: string } | null }> {
  const { data: titleRow, error: titleError } = await supabase
    .from('title_definition')
    .select('activity_type, difficulty_level')
    .eq('title_definition_id', titleDefinitionId)
    .maybeSingle();

  if (titleError) return { ok: false, reason: null, error: titleError };
  if (!titleRow) return { ok: false, reason: 'That title does not exist.', error: null };

  const { activity_type: activityType, difficulty_level: difficultyLevel } = titleRow as {
    activity_type: string;
    difficulty_level: number;
  };

  const { data: sessionRows, error: sessionError } = await supabase
    .from('session_log')
    .select('activity_type, difficulty_level, passed')
    .eq('user_id', userId);

  if (sessionError) return { ok: false, reason: null, error: sessionError };

  const highestPassed = highestPassedLevelByType((sessionRows ?? []) as SessionRow[]).get(activityType) ?? 0;
  if (difficultyLevel > highestPassed) {
    return { ok: false, reason: 'You have not earned that title yet.', error: null };
  }

  return { ok: true, reason: null, error: null };
}
