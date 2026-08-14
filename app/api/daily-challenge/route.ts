import { getSupabaseClient } from '../../../lib/supabase';
import { DAILY_CHALLENGE_COLUMNS, TIME_LIMIT_SECONDS, isExpired } from '../../../lib/dailyChallengeRules';
import {
  type DailyChallengeAttempt,
  findTodayAttempt,
  loadDailyChallengeQuestion,
  loadDailyChallengeQuestionWithSolution,
  loadEligibleQuestionIds,
  todayUtc,
} from '../../../lib/dailyChallengeQueries';
import type { SupabaseClient } from '../../../lib/sessionQueries';

const UNIQUE_VIOLATION = '23505';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/daily-challenge — today's Daily Challenge state for the caller (GitHub #337).
 *
 * A pure read, same principle as GET /api/sessions/current: it never draws a question or starts
 * an attempt — that is POST's job. See buildAttemptResponse below for the "what may the client
 * see" branching this shares with POST's "existing attempt" case.
 */
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { attempt, error } = await findTodayAttempt(supabase, user.id, todayUtc());
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!attempt) {
    const { questions, error: poolError } = await loadEligibleQuestionIds(supabase, user.id);
    if (poolError) return Response.json({ error: poolError.message }, { status: 500 });

    return Response.json({ attempt: null, available: (questions ?? []).length > 0, question: null }, { status: 200 });
  }

  return buildAttemptResponse(supabase, attempt);
}

/**
 * POST /api/daily-challenge — starts today's Daily Challenge, or returns the one already drawn.
 *
 * Idempotent by design, same shape as POST /api/sessions: uq_daily_challenge_attempt_user_date
 * caps the caller at one attempt per UTC day, and "start" and "resume" are the same call.
 */
export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const challengeDate = todayUtc();

  const existing = await findTodayAttempt(supabase, user.id, challengeDate);
  if (existing.error) return Response.json({ error: existing.error.message }, { status: 500 });
  if (existing.attempt) return buildAttemptResponse(supabase, existing.attempt, { resumed: true, status: 200 });

  const { questions: pool, error: poolError } = await loadEligibleQuestionIds(supabase, user.id);
  if (poolError) return Response.json({ error: poolError.message }, { status: 500 });

  if (!pool || pool.length === 0) {
    return Response.json(
      { error: 'Enroll in a course with available questions to unlock the Daily Challenge.' },
      { status: 400 },
    );
  }

  const picked = pool[Math.floor(Math.random() * pool.length)];

  const { data: inserted, error: insertError } = await supabase
    .from('daily_challenge_attempt')
    .insert({
      daily_challenge_attempt_id: crypto.randomUUID(),
      user_id: user.id,
      question_id: picked.question_id,
      challenge_date: challengeDate,
      deadline_at: new Date(Date.now() + TIME_LIMIT_SECONDS * 1000).toISOString(),
    })
    .select(DAILY_CHALLENGE_COLUMNS)
    .single();

  if (insertError || !inserted) {
    // A parallel request already claimed today's attempt — return that one instead of failing.
    if (insertError?.code === UNIQUE_VIOLATION) {
      const raced = await findTodayAttempt(supabase, user.id, challengeDate);
      if (raced.attempt) return buildAttemptResponse(supabase, raced.attempt, { resumed: true, status: 200 });
    }
    return Response.json({ error: insertError?.message ?? 'Could not start the Daily Challenge.' }, { status: 500 });
  }

  return buildAttemptResponse(supabase, inserted as DailyChallengeAttempt, { resumed: false, status: 201 });
}

/**
 * The response shape shared by GET and POST once an attempt row exists — branches on whether it
 * was submitted, and whether the deadline has passed. `extra` is only ever passed by POST
 * (resumed flag + the status code for that branch); GET's plain read defaults to 200.
 */
async function buildAttemptResponse(
  supabase: SupabaseClient,
  attempt: DailyChallengeAttempt,
  extra?: { resumed: boolean; status: number },
) {
  const status = extra?.status ?? 200;
  const resumedField = extra ? { resumed: extra.resumed } : {};

  if (attempt.submitted_at) {
    const { question, error } = await loadDailyChallengeQuestionWithSolution(supabase, attempt.question_id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const submittedOption = question?.options.find((option) => option.answer_id === attempt.submitted_option) ?? null;

    return Response.json(
      {
        attempt,
        question,
        correct: attempt.is_correct,
        score: attempt.score,
        explanation: submittedOption?.explanation ?? null,
        expired: false,
        ...resumedField,
      },
      { status },
    );
  }

  if (isExpired(attempt.deadline_at)) {
    return Response.json({ attempt, question: null, expired: true, ...resumedField }, { status });
  }

  const { question, error } = await loadDailyChallengeQuestion(supabase, attempt.question_id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ attempt, question, expired: false, ...resumedField }, { status });
}
