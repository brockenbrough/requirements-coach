// Shared logic for computing a student's mastery titles from session history (REQ-GAM-BL-1),
// so the student-facing titles route and any future consumer (e.g. the "new title earned"
// notification from REQ-GAM-PL-2.4) cannot drift apart.

import { ACTIVITY_TYPES } from './activityTypes';
import type { SupabaseClient } from './sessionQueries';

export type StudentTitle = {
  activityType: string;
  difficultyLevel: number | null;
  title: string | null;
};

type SessionRow = { activity_type: string; difficulty_level: number; passed: boolean };
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

  const highestPassed = new Map<string, number>();
  for (const row of sessions) {
    if (!row.passed) continue;
    const current = highestPassed.get(row.activity_type) ?? 0;
    if (row.difficulty_level > current) highestPassed.set(row.activity_type, row.difficulty_level);
  }

  // ACTIVITY_TYPES order keeps the response deterministic regardless of session_log row order.
  const titles: StudentTitle[] = ACTIVITY_TYPES.filter((type) => attempted.has(type)).map((activityType) => {
    const level = highestPassed.get(activityType) ?? null;
    const title = level === null ? NOT_STARTED : titleByKey.get(`${activityType}:${level}`) ?? null;
    return { activityType, difficultyLevel: level, title };
  });

  return { titles, error: null };
}
