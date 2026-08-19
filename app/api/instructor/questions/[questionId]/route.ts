import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { isActivityType } from '../../../../../lib/activityTypes';
import { DEFAULT_QUESTION_MAX_SCORE, isPassing } from '../../../../../lib/sessionRules';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

type AnswerPatchInput = {
  id: string;
  optionText: string;
  isCorrect: boolean;
  explanation?: string | null;
};

/**
 * PATCH /api/instructor/questions/{questionId} — edits an existing question and its answers
 * (GitHub #158).
 *
 * Body: { questionPrompt, activityType, difficultyLevel, answers: { id, optionText, isCorrect, explanation? }[] }
 *
 * - Every answer must carry the id of an answer already linked to this question. This route
 *   edits option text/correctness in place; it doesn't add or remove options — the form has no
 *   add/remove-option UI, so nothing would ever send a different count.
 * - answered_question_log.submitted_option has no ON DELETE clause on its FK to answer, so a
 *   previously-answered question's answer rows are physically undeletable. Updating in place
 *   (rather than delete-and-reinsert, as POST does for a brand-new question) is required here,
 *   not a style choice.
 * - order_number and max_score are NOT editable through this route: nothing outside this
 *   instructor's own GET ordering reads order_number, and rescaling max_score on edit would
 *   silently change the value of a question students may have already partially attempted.
 * - The question-level explanation is written only onto the answer row with isCorrect: true;
 *   other rows' explanation column is left untouched (no key sent at all, not null) — QuizQuestion
 *   has no field to carry a per-wrong-answer explanation, so there's nothing to round-trip for them.
 *
 * Unlike POST, a failure partway through the answers loop is not rolled back: a partially-applied
 * edit still leaves a fully linked, fully playable question (some fields just momentarily stale),
 * not an orphan — this asymmetry with POST's rollback is intentional.
 *
 * Returns 200 with { questionId, answerIds }.
 */
export async function PATCH(request: Request, { params }: { params: { questionId: string } }) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  const { questionId } = params;

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

  const answerInputs = answers as AnswerPatchInput[];

  for (const a of answerInputs) {
    if (typeof a.id !== 'string' || a.id.trim() === '') {
      return Response.json({ error: 'Each answer must have an id.' }, { status: 400 });
    }
    if (typeof a.optionText !== 'string' || a.optionText.trim() === '') {
      return Response.json({ error: 'Each answer must have a non-empty optionText.' }, { status: 400 });
    }
    if (typeof a.isCorrect !== 'boolean') {
      return Response.json({ error: 'Each answer must have a boolean isCorrect field.' }, { status: 400 });
    }
  }

  if (new Set(answerInputs.map((a) => a.id)).size !== answerInputs.length) {
    return Response.json({ error: 'Duplicate answer ids in request.' }, { status: 400 });
  }

  const correctCount = answerInputs.filter((a) => a.isCorrect).length;
  if (correctCount !== 1) {
    return Response.json({ error: 'Exactly one answer must be correct.' }, { status: 400 });
  }

  const { data: question, error: questionFetchError } = await supabase
    .from('question')
    .select('question_id, user_id')
    .eq('question_id', questionId)
    .maybeSingle();

  if (questionFetchError) return Response.json({ error: questionFetchError.message }, { status: 500 });
  if (!question) return Response.json({ error: 'Question not found.' }, { status: 404 });

  if ((question as { user_id: string | null }).user_id !== guard.user_id) {
    return Response.json({ error: 'You do not own this question.' }, { status: 403 });
  }

  const { data: links, error: linksError } = await supabase
    .from('question_to_answer')
    .select('answer_id')
    .eq('question_id', questionId);

  if (linksError) return Response.json({ error: linksError.message }, { status: 500 });

  const existingAnswerIds = new Set(((links ?? []) as { answer_id: string }[]).map((link) => link.answer_id));

  if (answerInputs.length !== existingAnswerIds.size) {
    return Response.json(
      { error: 'answers must match the existing option count for this question.' },
      { status: 400 },
    );
  }
  if (answerInputs.some((a) => !existingAnswerIds.has(a.id))) {
    return Response.json({ error: 'One or more answer ids do not belong to this question.' }, { status: 400 });
  }

  const { error: questionUpdateError } = await supabase
    .from('question')
    .update({
      question_prompt: questionPrompt.trim(),
      activity_type: activityType,
      difficulty_level: difficultyLevel,
    })
    .eq('question_id', questionId);

  if (questionUpdateError) return Response.json({ error: questionUpdateError.message }, { status: 500 });

  for (const a of answerInputs) {
    const payload: Record<string, unknown> = {
      option_text: a.optionText.trim(),
      is_correct: a.isCorrect,
    };
    if (a.isCorrect && typeof a.explanation === 'string') {
      payload.explanation = a.explanation;
    }

    const { error: answerUpdateError } = await supabase.from('answer').update(payload).eq('answer_id', a.id);
    if (answerUpdateError) return Response.json({ error: answerUpdateError.message }, { status: 500 });
  }

  return Response.json({ questionId, answerIds: answerInputs.map((a) => a.id) }, { status: 200 });
}

type UsageSessionRow = {
  session_id: string;
  user_id: string;
  cumulative_score: number;
  max_score: number;
  status: string;
};

/**
 * DELETE /api/instructor/questions/{questionId}[?force=true] — removes a question and its
 * answers from whichever catalog (activity_type) it belongs to (GitHub #359). A question has
 * exactly one activity_type column, not a join table, so deleting it can never reach into a
 * different catalog — the isolation the catalog detail page's edit mode needs falls straight out
 * of the schema rather than needing route-level enforcement.
 *
 * A question that has already been served to a student (a session_to_question row exists for it)
 * used to be refused outright with 409. It no longer is: an instructor can delete it anyway by
 * passing ?force=true, since question_to_answer/answered_question_log/session_to_question's FKs
 * to answer and question carry no ON DELETE clause (see the PATCH docblock above) and would
 * otherwise fail at the database. Without ?force=true the usage still 409s, but now with an
 * `impact` payload (sessions/students/points affected) so the UI can show a real warning instead
 * of a dead end — see components/DeleteQuestionModal.tsx.
 *
 * Deleting with usage present never takes points away: a student's already-earned
 * session_log.cumulative_score is never reduced, no matter how the question that earned it is
 * later deleted — points can only ever go up, never down. max_score may still shrink by the
 * question's own max_score (the question no longer exists to be worth points), but never below
 * cumulative_score itself, which keeps cumulative_score <= max_score an invariant and guarantees
 * `isPassing` can only improve, never regress: shrinking the denominator while holding the
 * numerator fixed can only raise the ratio. A completed session's `passed` is recomputed from the
 * new totals on that basis — it can flip failed-to-passed, never the reverse. `computeStudentScore`
 * (lib/scoreQueries.ts) only ever reads session_log.cumulative_score, so leaving it untouched here
 * is what keeps a student's total score from ever moving backwards because an instructor deleted
 * content.
 *
 * daily_challenge_attempt rows referencing this question are cleaned up unconditionally (not
 * gated by ?force=true) since that table isn't part of the usage warning — its own score never
 * rolls into session_log/computeStudentScore — but its FKs to question/answer have no ON DELETE
 * either, so leaving it alone would make the delete fail with an opaque database error for a
 * question that happened to be drawn for someone's daily challenge.
 *
 * Returns 200 with { questionId, pointsPreserved } on success.
 */
export async function DELETE(request: Request, { params }: { params: { questionId: string } }) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  const { questionId } = params;
  const force = new URL(request.url).searchParams.get('force') === 'true';

  const { data: question, error: questionFetchError } = await supabase
    .from('question')
    .select('question_id, user_id, max_score')
    .eq('question_id', questionId)
    .maybeSingle();

  if (questionFetchError) return Response.json({ error: questionFetchError.message }, { status: 500 });
  if (!question) return Response.json({ error: 'Question not found.' }, { status: 404 });

  const questionRow = question as { user_id: string | null; max_score: number | null };
  if (questionRow.user_id !== guard.user_id) {
    return Response.json({ error: 'You do not own this question.' }, { status: 403 });
  }

  const questionMaxScore = questionRow.max_score ?? DEFAULT_QUESTION_MAX_SCORE;

  const { data: usageRows, error: usageError } = await supabase
    .from('session_to_question')
    .select('session_id')
    .eq('question_id', questionId);

  if (usageError) return Response.json({ error: usageError.message }, { status: 500 });

  const sessionIds = [...new Set(((usageRows ?? []) as { session_id: string }[]).map((row) => row.session_id))];

  let pointsPreserved = 0;

  if (sessionIds.length > 0) {
    const { data: logs, error: logsError } = await supabase
      .from('answered_question_log')
      .select('session_id, score')
      .eq('question_id', questionId);

    if (logsError) return Response.json({ error: logsError.message }, { status: 500 });

    const scoreBySession = new Map<string, number>();
    for (const log of (logs ?? []) as { session_id: string; score: number }[]) {
      scoreBySession.set(log.session_id, (scoreBySession.get(log.session_id) ?? 0) + log.score);
    }
    pointsPreserved = [...scoreBySession.values()].reduce((sum, value) => sum + value, 0);

    const { data: sessionRows, error: sessionRowsError } = await supabase
      .from('session_log')
      .select('session_id, user_id, cumulative_score, max_score, status')
      .in('session_id', sessionIds);

    if (sessionRowsError) return Response.json({ error: sessionRowsError.message }, { status: 500 });

    const affectedSessions = (sessionRows ?? []) as UsageSessionRow[];

    if (!force) {
      return Response.json(
        {
          error:
            pointsPreserved > 0
              ? 'One or more students have already answered this question. They will keep the points they earned, but the question will be removed.'
              : 'This question is currently assigned to an in-progress session.',
          impact: {
            sessionsCount: sessionIds.length,
            answeredSessionsCount: scoreBySession.size,
            studentsAffectedCount: new Set(affectedSessions.map((row) => row.user_id)).size,
            pointsAlreadyEarned: pointsPreserved,
          },
        },
        { status: 409 },
      );
    }

    for (const row of affectedSessions) {
      // cumulative_score is never written here — a student's already-earned points never decrease.
      const newMaxScore = Math.max(row.cumulative_score, row.max_score - questionMaxScore);

      const updatePayload: Record<string, unknown> = { max_score: newMaxScore };
      if (row.status === 'completed') {
        updatePayload.passed = isPassing(row.cumulative_score, newMaxScore);
      }

      const { error: sessionUpdateError } = await supabase
        .from('session_log')
        .update(updatePayload)
        .eq('session_id', row.session_id);

      if (sessionUpdateError) return Response.json({ error: sessionUpdateError.message }, { status: 500 });
    }
  }

  const { error: dailyChallengeDeleteError } = await supabase
    .from('daily_challenge_attempt')
    .delete()
    .eq('question_id', questionId);
  if (dailyChallengeDeleteError) return Response.json({ error: dailyChallengeDeleteError.message }, { status: 500 });

  if (sessionIds.length > 0) {
    const { error: answeredLogDeleteError } = await supabase
      .from('answered_question_log')
      .delete()
      .eq('question_id', questionId);
    if (answeredLogDeleteError) return Response.json({ error: answeredLogDeleteError.message }, { status: 500 });

    const { error: sessionToQuestionDeleteError } = await supabase
      .from('session_to_question')
      .delete()
      .eq('question_id', questionId);
    if (sessionToQuestionDeleteError) {
      return Response.json({ error: sessionToQuestionDeleteError.message }, { status: 500 });
    }
  }

  const { data: links, error: linksError } = await supabase
    .from('question_to_answer')
    .select('answer_id')
    .eq('question_id', questionId);

  if (linksError) return Response.json({ error: linksError.message }, { status: 500 });

  const answerIds = ((links ?? []) as { answer_id: string }[]).map((link) => link.answer_id);

  const { error: unlinkError } = await supabase.from('question_to_answer').delete().eq('question_id', questionId);
  if (unlinkError) return Response.json({ error: unlinkError.message }, { status: 500 });

  if (answerIds.length > 0) {
    const { error: answerDeleteError } = await supabase.from('answer').delete().in('answer_id', answerIds);
    if (answerDeleteError) return Response.json({ error: answerDeleteError.message }, { status: 500 });
  }

  const { error: questionDeleteError } = await supabase.from('question').delete().eq('question_id', questionId);
  if (questionDeleteError) return Response.json({ error: questionDeleteError.message }, { status: 500 });

  return Response.json({ questionId, pointsPreserved }, { status: 200 });
}
