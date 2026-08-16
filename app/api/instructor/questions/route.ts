import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { isActivityType } from '../../../../lib/activityTypes';
import { DEFAULT_QUESTION_MAX_SCORE } from '../../../../lib/sessionRules';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

type AnswerInput = {
  optionText: string;
  isCorrect: boolean;
  explanation?: string | null;
};

/**
 * POST /api/instructor/questions — adds a new question with its answers to the question bank
 * (GitHub #121).
 *
 * Body: { questionPrompt, activityType, difficultyLevel, answers: AnswerInput[] }
 * - answers must have at least 2 items, exactly one with isCorrect: true
 * - order_number is auto-assigned as MAX(order_number) + 1 for the activity type
 * - user_id is taken from the authenticated instructor, not from the request body
 *
 * Returns 201 with { questionId, answerIds }.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  const guard = await requireInstructor(supabase, token);
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { questionPrompt, activityType, difficultyLevel, answers } = (body ?? {}) as {
    questionPrompt?: unknown;
    activityType?: unknown;
    difficultyLevel?: unknown;
    answers?: unknown;
  };

  if (typeof questionPrompt !== 'string' || questionPrompt.trim() === '') {
    return Response.json({ error: 'questionPrompt is required.' }, { status: 400 });
  }
  // Narrows activityType to string for the rest of the function — isActivityType's async check
  // below can no longer double as a type predicate the way the old synchronous version did.
  if (typeof activityType !== 'string') {
    return Response.json({ error: 'activityType must be a valid activity type.' }, { status: 400 });
  }
  const { valid: validActivityType, error: activityTypeError } = await isActivityType(supabase, activityType);
  if (activityTypeError) return Response.json({ error: activityTypeError.message }, { status: 500 });
  if (!validActivityType) {
    return Response.json({ error: 'activityType must be a valid activity type.' }, { status: 400 });
  }
  if (difficultyLevel !== 1 && difficultyLevel !== 2 && difficultyLevel !== 3) {
    return Response.json({ error: 'difficultyLevel must be 1, 2, or 3.' }, { status: 400 });
  }
  if (!Array.isArray(answers) || answers.length < 2) {
    return Response.json({ error: 'answers must be an array with at least 2 items.' }, { status: 400 });
  }

  const answerInputs = answers as AnswerInput[];

  for (const a of answerInputs) {
    if (typeof a.optionText !== 'string' || a.optionText.trim() === '') {
      return Response.json({ error: 'Each answer must have a non-empty optionText.' }, { status: 400 });
    }
    if (typeof a.isCorrect !== 'boolean') {
      return Response.json({ error: 'Each answer must have a boolean isCorrect field.' }, { status: 400 });
    }
  }

  const correctCount = answerInputs.filter((a) => a.isCorrect).length;
  if (correctCount !== 1) {
    return Response.json({ error: 'Exactly one answer must be correct.' }, { status: 400 });
  }

  // Resolve the instructor's user_id from the token so the question is attributed to them.
  const { data: { user }, error: authError } = await supabase.auth.getUser(token!);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  // Auto-assign order_number as MAX + 1 for this activity type so the new question
  // lands at the end of the pool rather than colliding with existing numbering.
  const { data: maxRow, error: maxError } = await supabase
    .from('question')
    .select('order_number')
    .eq('activity_type', activityType)
    .order('order_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxError) return Response.json({ error: maxError.message }, { status: 500 });

  const orderNumber = (maxRow?.order_number ?? 0) + 1;
  const questionId = crypto.randomUUID();

  const { error: questionError } = await supabase.from('question').insert({
    question_id: questionId,
    question_prompt: questionPrompt.trim(),
    activity_type: activityType,
    difficulty_level: difficultyLevel,
    order_number: orderNumber,
    max_score: DEFAULT_QUESTION_MAX_SCORE,
    user_id: user.id,
  });

  if (questionError) return Response.json({ error: questionError.message }, { status: 500 });

  // An orphaned question with no (or partial) answers is unplayable and pollutes order_number
  // sequencing for its activity_type — clean it up on any failure below, in child-before-parent
  // order (question_to_answer's FKs reference both answer and question). Same fire-and-forget,
  // best-effort style as the session_to_question rollback in app/api/sessions/route.ts: no
  // transaction (the Supabase JS client doesn't offer one), and the cleanup's own errors are
  // ignored in favor of surfacing the original failure.
  async function rollbackAndFail(insertedAnswerIds: string[], message: string) {
    await supabase!.from('question_to_answer').delete().eq('question_id', questionId);
    if (insertedAnswerIds.length > 0) {
      await supabase!.from('answer').delete().in('answer_id', insertedAnswerIds);
    }
    await supabase!.from('question').delete().eq('question_id', questionId);
    return Response.json({ error: message }, { status: 500 });
  }

  const answerIds: string[] = [];

  for (const a of answerInputs) {
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

  return Response.json({ questionId, answerIds }, { status: 201 });
}
