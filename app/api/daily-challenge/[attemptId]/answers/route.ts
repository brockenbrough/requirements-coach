import { getSupabaseClient } from '../../../../../lib/supabase';
import { DAILY_CHALLENGE_COLUMNS, isExpired, scoreForDailyChallenge } from '../../../../../lib/dailyChallengeRules';
import {
  type DailyChallengeAttempt,
  loadDailyChallengeQuestionWithSolution,
} from '../../../../../lib/dailyChallengeQueries';
import type { SupabaseClient } from '../../../../../lib/sessionQueries';

type SubmittedOption = { answer_id: string; is_correct: boolean; explanation: string | null };

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/daily-challenge/{attemptId}/answers — records the caller's answer and reveals the
 * result (GitHub #337).
 *
 * Write-through, same as POST /api/sessions/{sessionId}/answers: the answer is committed first,
 * the outcome disclosed second. The time limit is enforced here, not just client-side — a
 * request past deadline_at is rejected outright and nothing is written, since the row is
 * deliberately left unfinalized on a miss (see supabase/schema.sql's header comment on the
 * table).
 */
export async function POST(request: Request, { params }: { params: { attemptId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { selectedOptionId } = (body ?? {}) as { selectedOptionId?: unknown };

  if (typeof selectedOptionId !== 'string') {
    return Response.json({ error: 'selectedOptionId is required.' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { attemptId } = params;

  // Scoped by user_id: a foreign attempt id is indistinguishable from a non-existent one, same
  // convention POST /api/sessions/{sessionId}/answers uses for session_log.
  const { data: attemptRow, error: attemptError } = await supabase
    .from('daily_challenge_attempt')
    .select(DAILY_CHALLENGE_COLUMNS)
    .eq('daily_challenge_attempt_id', attemptId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (attemptError) return Response.json({ error: attemptError.message }, { status: 500 });
  if (!attemptRow) return Response.json({ error: 'Attempt not found.' }, { status: 404 });

  const attempt = attemptRow as DailyChallengeAttempt;

  if (attempt.submitted_at) {
    return Response.json(await alreadySubmittedBody(supabase, attempt), { status: 409 });
  }

  if (isExpired(attempt.deadline_at)) {
    return Response.json({ error: 'Time limit exceeded.', expired: true }, { status: 409 });
  }

  // Reject options belonging to a different question, same check the session answers route runs.
  const { data: optionRow, error: optionError } = await supabase
    .from('question_to_answer')
    .select('answer:answer_id ( answer_id, is_correct, explanation )')
    .eq('question_id', attempt.question_id)
    .eq('answer_id', selectedOptionId)
    .maybeSingle();

  if (optionError) return Response.json({ error: optionError.message }, { status: 500 });

  const option = (optionRow as { answer: SubmittedOption | null } | null)?.answer;
  if (!option) {
    return Response.json({ error: 'Selected option does not belong to this question.' }, { status: 400 });
  }

  const { data: questionRow, error: maxScoreError } = await supabase
    .from('question')
    .select('max_score')
    .eq('question_id', attempt.question_id)
    .maybeSingle();

  if (maxScoreError) return Response.json({ error: maxScoreError.message }, { status: 500 });

  const score = scoreForDailyChallenge(option.is_correct, (questionRow as { max_score: number | null } | null)?.max_score ?? null);

  // submitted_at IS NULL guards the same race a 23505 catch would on an insert — here it's an
  // UPDATE, so a lost race shows up as "no row returned" instead of a unique-violation error.
  const { data: updated, error: updateError } = await supabase
    .from('daily_challenge_attempt')
    .update({
      submitted_option: option.answer_id,
      is_correct: option.is_correct,
      score,
      submitted_at: new Date().toISOString(),
    })
    .eq('daily_challenge_attempt_id', attemptId)
    .is('submitted_at', null)
    .select(DAILY_CHALLENGE_COLUMNS)
    .maybeSingle();

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  if (!updated) {
    // Someone else's concurrent submit won the race — report the state it left behind.
    const { data: current, error: currentError } = await supabase
      .from('daily_challenge_attempt')
      .select(DAILY_CHALLENGE_COLUMNS)
      .eq('daily_challenge_attempt_id', attemptId)
      .maybeSingle();

    if (currentError) return Response.json({ error: currentError.message }, { status: 500 });
    if (current) return Response.json(await alreadySubmittedBody(supabase, current as DailyChallengeAttempt), { status: 409 });
    return Response.json({ error: 'This attempt has already been submitted.' }, { status: 409 });
  }

  return Response.json(
    { attempt: updated, correct: option.is_correct, explanation: option.explanation, score },
    { status: 200 },
  );
}

/** The 409 body for an attempt that already has a recorded answer — discloses what was recorded. */
async function alreadySubmittedBody(supabase: SupabaseClient, attempt: DailyChallengeAttempt) {
  const { question } = await loadDailyChallengeQuestionWithSolution(supabase, attempt.question_id);
  const submittedOption = question?.options.find((option) => option.answer_id === attempt.submitted_option) ?? null;

  return {
    error: 'This attempt has already been submitted.',
    attempt,
    correct: attempt.is_correct,
    score: attempt.score,
    explanation: submittedOption?.explanation ?? null,
  };
}
