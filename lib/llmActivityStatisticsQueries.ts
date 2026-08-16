import type { SupabaseClient } from './sessionQueries';

type SubmissionRow = { user_id: string; user_story_id: string; llm_score: number | null };
type UserStoryRow = { user_story_id: string; story_text: string };

export type ScoreDistributionEntry = { score: number; count: number };

export type ByUserStoryEntry = {
  userStoryId: string;
  storyText: string;
  submissionCount: number;
  averageScore: number | null;
};

export type LlmActivityStatistics = {
  totalSubmissions: number;
  gradedSubmissions: number;
  averageScore: number | null;
  studentsAttempted: number;
  scoreDistribution: ScoreDistributionEntry[];
  byUserStory: ByUserStoryEntry[];
};

/**
 * Class-wide statistics for an LLM-graded activity (GitHub #152).
 *
 * GitHub #379: `activityType` is optional and scopes both queries to one catalog. Omitting it
 * aggregates every LLM-graded submission in the system, which is exactly what this did before
 * instructors could create their own — so the existing caller's numbers do not move. Once a
 * second llm-graded activity exists, an unscoped call silently pools two different activities
 * into one average and one byUserStory list; that is an invisible failure rather than a loud one,
 * which is why the parameter exists before there is a screen asking for it.
 *
 * Pulls only the columns needed for aggregation — user_id, user_story_id, llm_score — rather
 * than every submission row in full (submitted_text, llm_feedback etc. are irrelevant here and
 * would bloat the payload). The math is done here, not in the route, so the route stays thin
 * and the aggregation logic can be tested independently.
 *
 * Only graded rows (llm_score IS NOT NULL) feed the numeric averages — an ungraded row
 * shouldn't count as a zero or drag the average down before the LLM has run.
 *
 * byUserStory covers every row in user_story, not just ones that have submissions — a story
 * nobody has tried yet shows submissionCount: 0 and averageScore: null rather than being
 * omitted, because "nobody has attempted this" is itself signal.
 */
export async function computeLlmActivityStatistics(
  supabase: SupabaseClient,
  activityType?: string,
): Promise<{
  statistics: LlmActivityStatistics | null;
  error: { message: string } | null;
}> {
  // The submission side reaches activity_type through user_story — an !inner embed, for the same
  // reason loadAllStudentActivity's is: a non-inner one would null the field and the filter would
  // then drop every row. This is the embed fk_user_story_activity_type was added for.
  const submissionQuery = activityType
    ? supabase
        .from('submission')
        .select('user_id, user_story_id, llm_score, story:user_story!inner ( activity_type )')
        .eq('story.activity_type', activityType)
    : supabase.from('submission').select('user_id, user_story_id, llm_score');

  const storyQuery = activityType
    ? supabase.from('user_story').select('user_story_id, story_text').eq('activity_type', activityType)
    : supabase.from('user_story').select('user_story_id, story_text');

  const [
    { data: submissionRows, error: submissionError },
    { data: storyRows, error: storyError },
  ] = await Promise.all([submissionQuery, storyQuery]);

  const error = submissionError ?? storyError ?? null;
  if (error) return { statistics: null, error };

  const submissions = (submissionRows ?? []) as SubmissionRow[];
  const stories = (storyRows ?? []) as UserStoryRow[];
  const graded = submissions.filter((s) => s.llm_score !== null);

  const totalSubmissions = submissions.length;
  const gradedSubmissions = graded.length;

  const averageScore =
    gradedSubmissions === 0
      ? null
      : Math.round(
          (graded.reduce((sum, s) => sum + (s.llm_score as number), 0) / gradedSubmissions) * 10,
        ) / 10;

  const studentsAttempted = new Set(submissions.map((s) => s.user_id)).size;

  const scoreCounts = new Map<number, number>();
  for (let i = 1; i <= 10; i++) scoreCounts.set(i, 0);
  for (const s of graded) {
    const score = s.llm_score as number;
    if (score >= 1 && score <= 10) scoreCounts.set(score, (scoreCounts.get(score) ?? 0) + 1);
  }
  const scoreDistribution: ScoreDistributionEntry[] = Array.from(scoreCounts.entries()).map(
    ([score, count]) => ({ score, count }),
  );

  const submissionsByStory = new Map<string, SubmissionRow[]>();
  for (const s of submissions) {
    const rows = submissionsByStory.get(s.user_story_id) ?? [];
    rows.push(s);
    submissionsByStory.set(s.user_story_id, rows);
  }

  const byUserStory: ByUserStoryEntry[] = stories.map((story) => {
    const storySubmissions = submissionsByStory.get(story.user_story_id) ?? [];
    const storyGraded = storySubmissions.filter((s) => s.llm_score !== null);
    const storyAvg =
      storyGraded.length === 0
        ? null
        : Math.round(
            (storyGraded.reduce((sum, s) => sum + (s.llm_score as number), 0) /
              storyGraded.length) *
              10,
          ) / 10;

    return {
      userStoryId: story.user_story_id,
      storyText: story.story_text,
      submissionCount: storySubmissions.length,
      averageScore: storyAvg,
    };
  });

  // Lowest-average-first; null-average rows (no graded submissions) last.
  byUserStory.sort((a, b) => {
    if (a.averageScore === null && b.averageScore === null) return 0;
    if (a.averageScore === null) return 1;
    if (b.averageScore === null) return -1;
    return a.averageScore - b.averageScore;
  });

  return {
    statistics: {
      totalSubmissions,
      gradedSubmissions,
      averageScore,
      studentsAttempted,
      scoreDistribution,
      byUserStory,
    },
    error: null,
  };
}
