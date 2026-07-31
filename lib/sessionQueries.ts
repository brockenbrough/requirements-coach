// Queries shared by the session routes, so "which question comes next" and "what may the
// client see" are answered in exactly one place.

import { getSupabaseClient } from './supabase';
import { DEFAULT_QUESTION_MAX_SCORE, SESSION_COLUMNS } from './sessionRules';

export type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;

// Answer options are never sent with is_correct — the server grades, the client does not.
const SESSION_QUESTION_COLUMNS = `
  position,
  question:question_id (
    question_id,
    question_prompt,
    difficulty_level,
    activity_type,
    max_score,
    question_to_answer (
      answer:answer_id ( answer_id, option_text )
    )
  )
`;

// is_correct and explanation are only ever disclosed for options the student already
// submitted, which is why they live on this query and not on the one above.
const SESSION_ANSWER_COLUMNS = `
  question_id,
  answer_id,
  score,
  submitted_at,
  answer:answer_id ( is_correct, explanation )
`;

type QuestionRow = {
  position: number;
  question: {
    question_id: string;
    question_prompt: string;
    difficulty_level: number;
    activity_type: string;
    max_score: number | null;
    question_to_answer: { answer: { answer_id: string; option_text: string } | null }[] | null;
  } | null;
};

type AnswerRow = {
  question_id: string;
  answer_id: string;
  score: number;
  submitted_at: string;
  answer: { is_correct: boolean; explanation: string | null } | null;
};

export type SessionPosition = { position: number; question_id: string };

export type QuestionOption = {
  answer_id: string;
  option_text: string;
  explanation: string | null;
  is_correct: boolean;
};

/** The student's running session for one activity type, or null. */
export async function findInProgressSession(
  supabase: SupabaseClient,
  userId: string,
  activityType: string,
) {
  const { data, error } = await supabase
    .from('session_log')
    .select(SESSION_COLUMNS)
    .eq('user_id', userId)
    .eq('activity_type', activityType)
    .eq('status', 'in-progress')
    .maybeSingle();

  return { session: error ? null : data, error };
}

/** The drawn questions in presentation order, with options but without the solution. */
export async function loadSessionQuestions(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('session_to_question')
    .select(SESSION_QUESTION_COLUMNS)
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (error) return { questions: null, error };

  const questions = ((data ?? []) as unknown as QuestionRow[])
    .filter((row) => row.question !== null)
    .map((row) => ({
      position: row.position,
      question_id: row.question!.question_id,
      question_prompt: row.question!.question_prompt,
      difficulty_level: row.question!.difficulty_level,
      activity_type: row.question!.activity_type,
      max_score: row.question!.max_score ?? DEFAULT_QUESTION_MAX_SCORE,
      options: (row.question!.question_to_answer ?? [])
        .map((link) => link.answer)
        .filter((answer): answer is { answer_id: string; option_text: string } => answer !== null),
    }));

  return { questions, error: null };
}

/** Just position and question id — enough to work out what is still unanswered. */
export async function loadSessionPositions(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('session_to_question')
    .select('position, question_id')
    .eq('session_id', sessionId);

  return { positions: (data ?? []) as SessionPosition[], error };
}

/**
 * All options of one question *with* the solution — is_correct, explanation and option_text.
 *
 * Only for the feedback route, and only after answered_question_log proves the student has
 * already committed an answer. Everything the client sees before that goes through
 * loadSessionQuestions, which deliberately omits these columns.
 */
export async function loadQuestionOptions(supabase: SupabaseClient, questionId: string) {
  const { data, error } = await supabase
    .from('question_to_answer')
    .select('answer:answer_id ( answer_id, option_text, explanation, is_correct )')
    .eq('question_id', questionId);

  if (error) return { options: null, error };

  const options = ((data ?? []) as unknown as { answer: QuestionOption | null }[])
    .map((row) => row.answer)
    .filter((answer): answer is QuestionOption => answer !== null);

  return { options, error: null };
}

/** Answers already submitted, including the feedback they have already earned. */
export async function loadSessionAnswers(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('answered_question_log')
    .select(SESSION_ANSWER_COLUMNS)
    .eq('session_id', sessionId);

  if (error) return { answers: null, error };

  const answers = ((data ?? []) as unknown as AnswerRow[]).map((row) => ({
    question_id: row.question_id,
    answer_id: row.answer_id,
    score: row.score,
    submitted_at: row.submitted_at,
    correct: row.answer?.is_correct ?? null,
    explanation: row.answer?.explanation ?? null,
  }));

  return { answers, error: null };
}

export type SessionProgress = {
  questionCount: number;
  answeredCount: number;
  nextPosition: number | null;
};

/**
 * Progress for several sessions at once, keyed by session id.
 *
 * Two queries regardless of how many sessions are passed in — a per-session lookup would turn
 * a status page into N+1 round trips.
 */
export async function loadProgressForSessions(supabase: SupabaseClient, sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return { progress: new Map<string, SessionProgress>(), error: null };
  }

  const [{ data: positionRows, error: positionError }, { data: answerRows, error: answerError }] =
    await Promise.all([
      supabase
        .from('session_to_question')
        .select('session_id, position, question_id')
        .in('session_id', sessionIds),
      supabase
        .from('answered_question_log')
        .select('session_id, question_id')
        .in('session_id', sessionIds),
    ]);

  const error = positionError ?? answerError ?? null;
  if (error) return { progress: null, error };

  const grouped = new Map(
    sessionIds.map((id) => [id, { positions: [] as SessionPosition[], answered: new Set<string>() }]),
  );

  for (const row of (positionRows ?? []) as (SessionPosition & { session_id: string })[]) {
    grouped.get(row.session_id)?.positions.push({ position: row.position, question_id: row.question_id });
  }

  for (const row of (answerRows ?? []) as { session_id: string; question_id: string }[]) {
    grouped.get(row.session_id)?.answered.add(row.question_id);
  }

  const progress = new Map<string, SessionProgress>();

  for (const [sessionId, { positions, answered }] of grouped) {
    progress.set(sessionId, {
      questionCount: positions.length,
      answeredCount: answered.size,
      nextPosition: nextUnansweredPosition(positions, answered),
    });
  }

  return { progress, error: null };
}

/**
 * The lowest position without a submitted answer, or null when everything is answered.
 *
 * Derived, never stored. A current_question_index column would be the only place in the
 * schema with real merge conflicts between two devices; a derived value cannot disagree
 * with itself.
 */
export function nextUnansweredPosition(
  positions: SessionPosition[],
  answeredQuestionIds: Set<string>,
): number | null {
  return positions
    .filter((row) => !answeredQuestionIds.has(row.question_id))
    .sort((a, b) => a.position - b.position)[0]?.position ?? null;
}
