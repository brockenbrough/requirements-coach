// Shared logic for computing class average and pass rate per quiz (REQ-PL-3.2's instructor
// review, GitHub #114), so the statistics route cannot drift from how these numbers are defined.

import type { SupabaseClient } from './sessionQueries';

export type QuizStatistics = {
  activityType: string;
  classAverage: number;
  passRate: number;
};

type SessionRow = { activity_type: string; cumulative_score: number; max_score: number; passed: boolean };
type ActivityTypeRow = { activity_type: string };

/**
 * Class average score and pass rate for every quiz (activity type), across every student's
 * completed attempts. "Every quiz of the current professor" is, today, every row in the
 * activity_type table (#122) — there is no professor-to-quiz ownership anywhere in the schema,
 * the same gap noted for GitHub #115's "students of the current prof".
 *
 * classAverage is the mean of each completed session's own percentage (cumulative_score /
 * max_score), not sum(cumulative_score) / sum(max_score) — so a quiz whose max_score happens to
 * vary across sessions isn't skewed toward whichever attempts were worth more points. passRate
 * is the share of a quiz's completed sessions with passed = true. A quiz with no completed
 * sessions yet still gets an entry, at 0% for both, rather than being divided by zero.
 *
 * An empty activity_type table — no quizzes exist at all — is the only case that reports
 * nothing; the caller turns that into the AC's 404.
 */
export async function computeQuizStatistics(supabase: SupabaseClient) {
  const [{ data: activityRows, error: activityError }, { data: sessionRows, error: sessionError }] =
    await Promise.all([
      supabase.from('activity_type').select('activity_type'),
      supabase
        .from('session_log')
        .select('activity_type, cumulative_score, max_score, passed')
        .eq('status', 'completed'),
    ]);

  const error = activityError ?? sessionError ?? null;
  if (error) return { statistics: null, error };

  const activityTypes = (activityRows ?? []) as ActivityTypeRow[];
  if (activityTypes.length === 0) return { statistics: [], error: null };

  const byActivity = new Map<string, SessionRow[]>();
  for (const row of (sessionRows ?? []) as SessionRow[]) {
    const attempts = byActivity.get(row.activity_type) ?? [];
    attempts.push(row);
    byActivity.set(row.activity_type, attempts);
  }

  const statistics: QuizStatistics[] = activityTypes.map(({ activity_type: activityType }) => {
    const attempts = byActivity.get(activityType) ?? [];

    if (attempts.length === 0) {
      return { activityType, classAverage: 0, passRate: 0 };
    }

    const totalPercent = attempts.reduce((sum, row) => {
      return sum + (row.max_score > 0 ? (row.cumulative_score / row.max_score) * 100 : 0);
    }, 0);

    const passCount = attempts.filter((row) => row.passed).length;

    return {
      activityType,
      classAverage: Math.round(totalPercent / attempts.length),
      passRate: Math.round((passCount / attempts.length) * 100),
    };
  });

  return { statistics, error: null };
}
