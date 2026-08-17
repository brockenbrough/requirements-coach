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
 * Statistics for LLM-graded activities (GitHub #152).
 *
 * GitHub #379: `activityType` scopes both queries — a single catalog key, a list of them, or
 * omitted entirely for "every LLM-graded submission in the system, pooled" (the pre-#379
 * behavior, kept as the unscoped default for any future caller that genuinely wants the whole
 * system). GET /api/instructor/acceptance-criteria/statistics never actually omits it: it always
 * passes this instructor's own owned llm-graded types (listOwnedActivityTypes(..., 'llm-graded'),
 * lib/activityTypeQueries.ts), so a fresh instructor with no llm-graded catalog gets a zeroed
 * result rather than everyone else's pooled numbers — see that route for why. An explicit ?
 * activityType= single-catalog scope stays available for whatever screen needs one catalog's own
 * figures instead of an instructor's whole set.
 *
 * WRITE_ACCEPTANCE_CRITERIA is a built-in (activity_type.creator_id IS NULL), so — same as every
 * built-in catalog — it is excluded from the instructor route's owned-types scope for every
 * instructor, not just non-creators. An instructor who hasn't created their own llm-graded catalog
 * yet (CreateCatalogModal, GitHub #379) reads all-zero here, by design, not a bug — it starts
 * reporting real numbers the moment their own catalog gets a submission.
 *
 * Pulls only the columns needed for aggregation — user_id, user_story_id, llm_score — rather
 * than every submission row in full (submitted_text, llm_feedback etc. are irrelevant here and
 * would bloat the payload). The math is done here, not in the route, so the route stays thin
 * and the aggregation logic can be tested independently.
 *
 * Only graded rows (llm_score IS NOT NULL) feed the numeric averages — an ungraded row
 * shouldn't count as a zero or drag the average down before the LLM has run.
 *
 * byUserStory covers every row in user_story within scope, not just ones that have submissions —
 * a story nobody has tried yet shows submissionCount: 0 and averageScore: null rather than being
 * omitted, because "nobody has attempted this" is itself signal.
 */
export async function computeLlmActivityStatistics(
  supabase: SupabaseClient,
  activityType?: string | string[],
): Promise<{
  statistics: LlmActivityStatistics | null;
  error: { message: string } | null;
}> {
  const activityTypes = activityType === undefined ? undefined : Array.isArray(activityType) ? activityType : [activityType];

  if (activityTypes && activityTypes.length === 0) {
    return {
      statistics: {
        totalSubmissions: 0,
        gradedSubmissions: 0,
        averageScore: null,
        studentsAttempted: 0,
        scoreDistribution: Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: 0 })),
        byUserStory: [],
      },
      error: null,
    };
  }

  // The submission side reaches activity_type through user_story — an !inner embed, for the same
  // reason loadAllStudentActivity's is: a non-inner one would null the field and the filter would
  // then drop every row. This is the embed fk_user_story_activity_type was added for.
  const submissionQuery = activityTypes
    ? supabase
        .from('submission')
        .select('user_id, user_story_id, llm_score, story:user_story!inner ( activity_type )')
        .in('story.activity_type', activityTypes)
    : supabase.from('submission').select('user_id, user_story_id, llm_score');

  const storyQuery = activityTypes
    ? supabase.from('user_story').select('user_story_id, story_text').in('activity_type', activityTypes)
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
