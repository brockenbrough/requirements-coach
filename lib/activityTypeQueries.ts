// GitHub #347: shared logic for listing every quiz (activity_type row) with its author and
// question count, so GET /api/instructor/quizzes has exactly one place that defines what a
// "quiz" looks like on the wire.

import type { SupabaseClient } from './sessionQueries';

export type QuizSummary = {
  activityType: string;
  name: string;
  description: string | null;
  /** The instructor's display name, or 'Built-in' for the three seeded quizzes (creator_id is NULL). */
  authorName: string;
  questionCount: number;
};

type QuizRow = {
  activity_type: string;
  quiz_name: string;
  description: string | null;
  creator_id: string | null;
  creator: { first_name: string | null; last_name: string | null; username: string | null } | null;
  question: { count: number }[] | null;
};

/**
 * Every quiz in the system — built-in or instructor-created — with its author and question
 * count, for the instructor-facing browse page. Quizzes are globally shared (not scoped to the
 * calling instructor): anyone can see and reuse anyone else's, which is the entire point of
 * GitHub #347.
 *
 * One query, using the same creator:creator_id(...) + related-table (count) embed pattern
 * lib/courseQueries.ts's listJoinableCourses uses for professor_name/student_count — author name
 * and question count come back on the same row as the quiz itself rather than two round trips
 * merged in JS.
 */
export async function listQuizzesWithAuthorAndCount(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('activity_type')
    .select(
      'activity_type, quiz_name, description, creator_id, creator:creator_id(first_name, last_name, username), question(count)',
    )
    .order('quiz_name', { ascending: true });

  if (error) return { quizzes: null, error };

  const quizzes: QuizSummary[] = ((data ?? []) as unknown as QuizRow[]).map((row) => {
    const fullName = [row.creator?.first_name, row.creator?.last_name].filter(Boolean).join(' ').trim();
    const authorName = row.creator_id === null ? 'Built-in' : fullName || row.creator?.username || 'Unknown instructor';

    return {
      activityType: row.activity_type,
      name: row.quiz_name,
      description: row.description,
      authorName,
      questionCount: row.question?.[0]?.count ?? 0,
    };
  });

  return { quizzes, error: null };
}
