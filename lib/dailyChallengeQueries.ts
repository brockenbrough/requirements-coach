// Queries for the Daily Challenge routes (GitHub #337), so "which question comes today" and
// "what may the client see before submitting" are answered in exactly one place — mirrors the
// role lib/sessionQueries.ts plays for Type A sessions.

import { DAILY_CHALLENGE_COLUMNS } from './dailyChallengeRules';
import { getEnrolledCourseIds } from './courseQueries';
import { loadQuestionOptions, type SupabaseClient } from './sessionQueries';
import { DEFAULT_QUESTION_MAX_SCORE } from './sessionRules';
import { shuffleArray } from './shuffleArray';

// Options are never sent with is_correct/explanation before a submission exists — same
// non-disclosure boundary as SESSION_QUESTION_COLUMNS in lib/sessionQueries.ts.
const DAILY_CHALLENGE_QUESTION_COLUMNS = `
  question_id,
  question_prompt,
  difficulty_level,
  activity_type,
  max_score,
  question_to_answer (
    answer:answer_id ( answer_id, option_text )
  )
`;

type QuestionRow = {
  question_id: string;
  question_prompt: string;
  difficulty_level: number;
  activity_type: string;
  max_score: number | null;
  question_to_answer: { answer: { answer_id: string; option_text: string } | null }[] | null;
};

export type DailyChallengeAttempt = {
  daily_challenge_attempt_id: string;
  user_id: string;
  question_id: string;
  challenge_date: string;
  started_at: string;
  deadline_at: string;
  submitted_option: string | null;
  is_correct: boolean | null;
  score: number | null;
  submitted_at: string | null;
};

/** Today's UTC calendar day, e.g. "2026-08-14" — toISOString() is always UTC. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The caller's attempt for one UTC day, or null — at most one exists (uq_daily_challenge_attempt_user_date). */
export async function findTodayAttempt(supabase: SupabaseClient, userId: string, challengeDate: string) {
  const { data, error } = await supabase
    .from('daily_challenge_attempt')
    .select(DAILY_CHALLENGE_COLUMNS)
    .eq('user_id', userId)
    .eq('challenge_date', challengeDate)
    .maybeSingle();

  return { attempt: error ? null : (data as DailyChallengeAttempt | null), error };
}

/**
 * The question ids the Daily Challenge may draw from for one student: every question authored
 * by an instructor whose course the student is enrolled in (course.creator_id -> question.user_id),
 * per the team's scoping decision — not the whole cross-instructor bank. No activity_type or
 * difficulty_level filter: the issue asks for "one random question," not a leveled draw.
 *
 * A student enrolled in no courses short-circuits to an empty pool without querying course/question.
 */
export async function loadEligibleQuestionIds(supabase: SupabaseClient, userId: string) {
  const enrolled = await getEnrolledCourseIds(supabase, userId);
  if (enrolled.error) return { questions: null, error: enrolled.error };
  if (enrolled.courseIds.length === 0) {
    return { questions: [] as { question_id: string; max_score: number | null }[], error: null };
  }

  const { data: courses, error: coursesError } = await supabase
    .from('course')
    .select('creator_id')
    .in('course_id', enrolled.courseIds);

  if (coursesError) return { questions: null, error: coursesError };

  const instructorIds = [...new Set(((courses ?? []) as { creator_id: string }[]).map((row) => row.creator_id))];
  if (instructorIds.length === 0) return { questions: [], error: null };

  const { data: questions, error: questionsError } = await supabase
    .from('question')
    .select('question_id, max_score')
    .in('user_id', instructorIds);

  if (questionsError) return { questions: null, error: questionsError };

  return { questions: (questions ?? []) as { question_id: string; max_score: number | null }[], error: null };
}

/**
 * One question with its shuffled options, no solution — the same shape loadSessionQuestions
 * (lib/sessionQueries.ts) builds per drawn question, just fetched directly by question_id
 * instead of via session_to_question, since a Daily Challenge attempt draws exactly one.
 */
export async function loadDailyChallengeQuestion(supabase: SupabaseClient, questionId: string) {
  const { data, error } = await supabase
    .from('question')
    .select(DAILY_CHALLENGE_QUESTION_COLUMNS)
    .eq('question_id', questionId)
    .maybeSingle();

  if (error) return { question: null, error };
  if (!data) return { question: null, error: null };

  const row = data as unknown as QuestionRow;

  return {
    question: {
      question_id: row.question_id,
      question_prompt: row.question_prompt,
      difficulty_level: row.difficulty_level,
      activity_type: row.activity_type,
      max_score: row.max_score ?? DEFAULT_QUESTION_MAX_SCORE,
      options: shuffleArray(
        (row.question_to_answer ?? [])
          .map((link) => link.answer)
          .filter((answer): answer is { answer_id: string; option_text: string } => answer !== null),
      ),
    },
    error: null,
  };
}

/**
 * The same question, but with every option's is_correct/explanation disclosed — for an attempt
 * that has already been submitted. Reuses loadQuestionOptions (lib/sessionQueries.ts), the same
 * "reveal after commit" helper the session feedback route reads from, rather than a second copy
 * of that join.
 *
 * Only ever called after daily_challenge_attempt.submitted_at is set — revealing this before
 * that would turn the endpoint into an oracle for trying options until one is right, the same
 * risk loadSessionQuestions/loadQuestionOptions's split guards against.
 */
export async function loadDailyChallengeQuestionWithSolution(supabase: SupabaseClient, questionId: string) {
  const [{ data: questionRow, error: questionError }, { options, error: optionsError }] = await Promise.all([
    supabase
      .from('question')
      .select('question_id, question_prompt, difficulty_level, activity_type, max_score')
      .eq('question_id', questionId)
      .maybeSingle(),
    loadQuestionOptions(supabase, questionId),
  ]);

  const error = questionError ?? optionsError;
  if (error) return { question: null, error };
  if (!questionRow) return { question: null, error: null };

  const row = questionRow as {
    question_id: string;
    question_prompt: string;
    difficulty_level: number;
    activity_type: string;
    max_score: number | null;
  };

  return {
    question: {
      question_id: row.question_id,
      question_prompt: row.question_prompt,
      difficulty_level: row.difficulty_level,
      activity_type: row.activity_type,
      max_score: row.max_score ?? DEFAULT_QUESTION_MAX_SCORE,
      options: options ?? [],
    },
    error: null,
  };
}
