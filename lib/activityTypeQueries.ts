// GitHub #347: shared logic for listing every quiz (activity_type row) with its author and
// question count, so GET /api/instructor/quizzes has exactly one place that defines what a
// "quiz" looks like on the wire.

import type { SupabaseClient } from './sessionQueries';
import type { CatalogQuestion } from './quizQuestionTypes';
import type { ActivityType } from './activityTypes';

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

export type QuizMeta = Omit<QuizSummary, 'questionCount'>;

/**
 * GitHub #359: one catalog's own metadata (name/description/author), for the catalog detail page
 * — the single-row counterpart to listQuizzesWithAuthorAndCount's list. Returns { quiz: null }
 * (not an error) when activityType matches no row, so the route can turn that into a 404.
 */
export async function getQuizByActivityType(supabase: SupabaseClient, activityType: string) {
  const { data, error } = await supabase
    .from('activity_type')
    .select('activity_type, quiz_name, description, creator_id, creator:creator_id(first_name, last_name, username)')
    .eq('activity_type', activityType)
    .maybeSingle();

  if (error) return { quiz: null, error };
  if (!data) return { quiz: null, error: null };

  const row = data as unknown as QuizRow;
  const fullName = [row.creator?.first_name, row.creator?.last_name].filter(Boolean).join(' ').trim();
  const authorName = row.creator_id === null ? 'Built-in' : fullName || row.creator?.username || 'Unknown instructor';

  const quiz: QuizMeta = {
    activityType: row.activity_type,
    name: row.quiz_name,
    description: row.description,
    authorName,
  };

  return { quiz, error: null };
}

type CatalogQuestionRow = {
  question_id: string;
  question_prompt: string;
  difficulty_level: number;
  user_id: string | null;
  question_to_answer: { answer: { answer_id: string; option_text: string; is_correct: boolean; explanation: string | null } | null }[];
};

/**
 * GitHub #359: every question in one catalog (activity_type), any author — the read-only view a
 * catalog's detail page shows before "Edit" is clicked. Unlike GET /api/instructor/questions
 * (scoped to question.user_id = the caller), this deliberately returns every question in the
 * catalog: quizzes are shared, so browsing a colleague's catalog must show what's actually in it,
 * not just the rows the caller happens to own. ownerId travels along so the client can decide
 * whose rows get Edit/Delete icons without a second round trip.
 */
export async function listCatalogQuestions(supabase: SupabaseClient, activityType: string) {
  const { data, error } = await supabase
    .from('question')
    .select(
      'question_id, question_prompt, difficulty_level, user_id, question_to_answer(answer:answer_id(answer_id, option_text, is_correct, explanation))',
    )
    .eq('activity_type', activityType)
    .order('difficulty_level', { ascending: true })
    .order('order_number', { ascending: true });

  if (error) return { questions: null, error };

  const questions: CatalogQuestion[] = ((data ?? []) as unknown as CatalogQuestionRow[]).map((row) => {
    const answers = row.question_to_answer.map((link) => link.answer).filter((a): a is NonNullable<typeof a> => a !== null);
    const correctAnswer = answers.find((a) => a.is_correct);

    return {
      id: row.question_id,
      quizType: activityType as ActivityType,
      level: row.difficulty_level as 1 | 2 | 3,
      questionText: row.question_prompt,
      answerOptions: answers.map((a) => ({ id: a.answer_id, text: a.option_text, isCorrect: a.is_correct })),
      explanation: correctAnswer?.explanation ?? '',
      ownerId: row.user_id,
    };
  });

  return { questions, error: null };
}
