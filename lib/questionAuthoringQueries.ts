import type { SupabaseClient } from './sessionQueries';
import { isActivityType } from './activityTypes';
import { mcqPointsForDifficulty } from './sessionRules';

/**
 * Shared question-creation logic behind POST /api/instructor/questions (GitHub #121) and, since
 * GitHub #380, POST /api/instructor/assembled-quizzes/{quizId}/questions (create-and-hand-pick in
 * one request). Both routes need identical validation and the identical insert-with-rollback
 * sequence; extracted here rather than duplicated so the two can't drift apart.
 */

export type AnswerInput = { optionText: string; isCorrect: boolean; explanation?: string | null };

export type QuestionInputBody = {
  questionPrompt?: unknown;
  activityType?: unknown;
  difficultyLevel?: unknown;
  answers?: unknown;
};

export type ValidatedQuestionInput = {
  questionPrompt: string;
  activityType: string;
  difficultyLevel: 1 | 2 | 3;
  answers: AnswerInput[];
};

export type ValidationResult =
  | { ok: true; data: ValidatedQuestionInput }
  | { ok: false; status: number; error: string };

/** Same validation POST /api/instructor/questions has always enforced — moved here unchanged. */
export async function validateQuestionInput(supabase: SupabaseClient, body: QuestionInputBody): Promise<ValidationResult> {
  const { questionPrompt, activityType, difficultyLevel, answers } = body;

  if (typeof questionPrompt !== 'string' || questionPrompt.trim() === '') {
    return { ok: false, status: 400, error: 'questionPrompt is required.' };
  }
  // Narrows activityType to string for the rest of the function — isActivityType's async check
  // below can no longer double as a type predicate the way the old synchronous version did.
  if (typeof activityType !== 'string') {
    return { ok: false, status: 400, error: 'activityType must be a valid activity type.' };
  }
  const { valid: validActivityType, error: activityTypeError } = await isActivityType(supabase, activityType);
  if (activityTypeError) return { ok: false, status: 500, error: activityTypeError.message };
  if (!validActivityType) {
    return { ok: false, status: 400, error: 'activityType must be a valid activity type.' };
  }
  if (difficultyLevel !== 1 && difficultyLevel !== 2 && difficultyLevel !== 3) {
    return { ok: false, status: 400, error: 'difficultyLevel must be 1, 2, or 3.' };
  }
  if (!Array.isArray(answers) || answers.length < 2) {
    return { ok: false, status: 400, error: 'answers must be an array with at least 2 items.' };
  }

  const answerInputs = answers as AnswerInput[];

  for (const a of answerInputs) {
    if (typeof a.optionText !== 'string' || a.optionText.trim() === '') {
      return { ok: false, status: 400, error: 'Each answer must have a non-empty optionText.' };
    }
    if (typeof a.isCorrect !== 'boolean') {
      return { ok: false, status: 400, error: 'Each answer must have a boolean isCorrect field.' };
    }
  }

  const correctCount = answerInputs.filter((a) => a.isCorrect).length;
  if (correctCount !== 1) {
    return { ok: false, status: 400, error: 'Exactly one answer must be correct.' };
  }

  return { ok: true, data: { questionPrompt, activityType, difficultyLevel, answers: answerInputs } };
}

export type CreateQuestionResult =
  | { ok: true; questionId: string; answerIds: string[] }
  | { ok: false; status: number; error: string; code?: string };

/**
 * Inserts the question, then each answer and its question_to_answer link, in the same
 * child-before-parent rollback order POST /api/instructor/questions has always used on any
 * failure partway through (no Supabase JS transaction exists to lean on instead).
 */
export async function createQuestionWithAnswers(
  supabase: SupabaseClient,
  input: ValidatedQuestionInput,
  userId: string,
): Promise<CreateQuestionResult> {
  const { questionPrompt, activityType, difficultyLevel, answers } = input;

  // Auto-assign order_number as MAX + 1 for this activity type so the new question
  // lands at the end of the pool rather than colliding with existing numbering.
  const { data: maxRow, error: maxError } = await supabase
    .from('question')
    .select('order_number')
    .eq('activity_type', activityType)
    .order('order_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxError) return { ok: false, status: 500, error: maxError.message };

  const orderNumber = (maxRow?.order_number ?? 0) + 1;
  const questionId = crypto.randomUUID();

  const { error: questionError } = await supabase.from('question').insert({
    question_id: questionId,
    question_prompt: questionPrompt.trim(),
    activity_type: activityType,
    difficulty_level: difficultyLevel,
    order_number: orderNumber,
    max_score: mcqPointsForDifficulty(difficultyLevel),
    user_id: userId,
  });

  if (questionError) return { ok: false, status: 500, error: questionError.message, code: (questionError as { code?: string }).code };

  async function rollbackAndFail(insertedAnswerIds: string[], message: string): Promise<CreateQuestionResult> {
    await supabase.from('question_to_answer').delete().eq('question_id', questionId);
    if (insertedAnswerIds.length > 0) {
      await supabase.from('answer').delete().in('answer_id', insertedAnswerIds);
    }
    await supabase.from('question').delete().eq('question_id', questionId);
    return { ok: false, status: 500, error: message };
  }

  const answerIds: string[] = [];

  for (const a of answers) {
    const answerId = crypto.randomUUID();

    const { error: answerError } = await supabase.from('answer').insert({
      answer_id: answerId,
      option_text: a.optionText.trim(),
      is_correct: a.isCorrect,
      explanation: a.explanation ?? null,
    });

    if (answerError) return rollbackAndFail(answerIds, answerError.message);

    answerIds.push(answerId);

    const { error: linkError } = await supabase.from('question_to_answer').insert({
      question_id: questionId,
      answer_id: answerId,
    });

    if (linkError) return rollbackAndFail(answerIds, linkError.message);
  }

  return { ok: true, questionId, answerIds };
}

/**
 * Deletes a fully-created question and its answers — the same child-before-parent order as
 * rollbackAndFail above, but for callers unwinding a *later* step (e.g. GitHub #380's
 * create-and-hand-pick route, which must remove the question it just created if hand-picking it
 * onto the quiz fails) rather than a failure inside creation itself.
 */
export async function deleteQuestionWithAnswers(supabase: SupabaseClient, questionId: string, answerIds: readonly string[]) {
  await supabase.from('question_to_answer').delete().eq('question_id', questionId);
  if (answerIds.length > 0) {
    await supabase.from('answer').delete().in('answer_id', answerIds as string[]);
  }
  await supabase.from('question').delete().eq('question_id', questionId);
}
